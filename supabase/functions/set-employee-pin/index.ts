import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hashPin(salt: string, pin: string) {
  return sha256(salt + ":" + pin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Connexion requise." }, 401);

  const managerClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await managerClient.auth.getUser();
  if (authError || !auth.user) return json({ error: "Session invalide." }, 401);

  const admin = createClient(url, serviceKey);
  const { data: manager } = await admin.from("profiles")
    .select("role,access_level,active").eq("id", auth.user.id).single();
  if (!manager?.active || manager.role !== "manager" || manager.access_level !== "manager_advanced") {
    return json({ error: "Action réservée au manager avancé." }, 403);
  }

  let body: { employee_email?: string; pin?: string };
  try { body = await req.json(); } catch { return json({ error: "Requête invalide." }, 400); }
  const email = String(body.employee_email || "").trim().toLowerCase();
  const pin = String(body.pin || "");
  if (!email || !/^\d{4}$/.test(pin)) return json({ error: "Compte ou PIN invalide." }, 400);

  const { data: account, error: accountError } = await admin.from("profiles")
    .select("id,role,access_level,active")
    .eq("email", email)
    .in("role", ["employee", "manager"])
    .single();
  if (accountError || !account?.active) return json({ error: "Compte introuvable ou désactivé." }, 404);

  const fingerprint = await sha256(serviceKey.slice(0, 32) + ":" + pin);
  const { data: duplicate, error: duplicateError } = await admin.from("employee_pin_credentials")
    .select("employee_id").eq("pin_fingerprint", fingerprint).neq("employee_id", account.id).limit(1);
  if (duplicateError) return json({ error: "Impossible de vérifier l'unicité du PIN." }, 500);
  if (duplicate?.length) return json({ error: "Ce code PIN est déjà utilisé par un autre compte." }, 409);

  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const pin_hash = await hashPin(salt, pin);
  const { error } = await admin.from("employee_pin_credentials").upsert({
    employee_id: account.id,
    pin_salt: salt,
    pin_hash,
    pin_fingerprint: fingerprint,
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: "Impossible d'enregistrer le code PIN." }, 500);
  return json({ success: true });
});
