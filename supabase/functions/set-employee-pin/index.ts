import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function hashPin(salt: string, pin: string) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Connexion manager requise." }, 401);

  const managerClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await managerClient.auth.getUser();
  if (authError || !auth.user) return json({ error: "Session manager invalide." }, 401);

  const admin = createClient(url, serviceKey);
  const { data: manager } = await admin.from("profiles").select("role,active").eq("id", auth.user.id).single();
  if (!manager?.active || manager.role !== "manager") return json({ error: "Action réservée aux managers actifs." }, 403);

  let body: { employee_email?: string; pin?: string };
  try { body = await req.json(); } catch { return json({ error: "Requête invalide." }, 400); }
  const email = String(body.employee_email || "").trim().toLowerCase();
  const pin = String(body.pin || "");
  if (!email || !/^\d{4}$/.test(pin)) return json({ error: "Adresse employé ou PIN invalide." }, 400);

  const { data: employee, error: employeeError } = await admin.from("profiles")
    .select("id,role,active").eq("email", email).eq("role", "employee").single();
  if (employeeError || !employee?.active) return json({ error: "Employé introuvable ou désactivé." }, 404);

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(saltBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const pin_hash = await hashPin(salt, pin);
  const { error } = await admin.from("employee_pin_credentials").upsert({
    employee_id: employee.id, pin_salt: salt, pin_hash, updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: "Impossible d'enregistrer le code PIN." }, 500);
  return json({ success: true });
});
