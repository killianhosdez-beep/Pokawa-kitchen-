import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

async function makeHash(salt: string, pin: string) {
  const data = new TextEncoder().encode(salt + ":" + pin);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Méthode non autorisée." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return reply({ error: "Connexion manager requise." }, 401);

  const client = createClient(url, anon, { global: { headers: { Authorization: header } } });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Session manager invalide." }, 401);

  const admin = createClient(url, service);
  const { data: manager } = await admin.from("profiles").select("role,active").eq("id", auth.user.id).single();
  if (!manager?.active || manager.role !== "manager") return reply({ error: "Action réservée aux managers actifs." }, 403);

  let body: { full_name?: string; pin?: string };
  try { body = await req.json(); } catch { return reply({ error: "Requête invalide." }, 400); }
  const name = String(body.full_name || "").trim().replace(/\s+/g, " ");
  const pin = String(body.pin || "");
  if (!name || name.length > 80 || !/^\d{4}$/.test(pin)) {
    return reply({ error: "Le nom et un code personnel de 4 chiffres sont obligatoires." }, 400);
  }

  const { data: profiles, error: listError } = await admin.from("profiles").select("full_name,role,active").eq("role", "employee").eq("active", true);
  if (listError) return reply({ error: "Impossible de vérifier les employés." }, 500);
  if ((profiles || []).some(p => String(p.full_name || "").trim().toLowerCase() === name.toLowerCase())) {
    return reply({ error: "Un employé actif porte déjà ce nom." }, 409);
  }

  // E-mail et mot de passe techniques générés côté serveur, jamais demandés à l'équipe.
  const id = crypto.randomUUID();
  const email = "staff-" + id + "@pokawa-kitchen.invalid";
  const password = crypto.randomUUID() + "-" + crypto.randomUUID() + "aA9!";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name, role: "employee" },
  });
  if (createError || !created.user) return reply({ error: createError?.message || "Création du compte impossible." }, 500);

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id, email, full_name: name, role: "employee", active: true,
  }, { onConflict: "id" });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return reply({ error: "Enregistrement du profil impossible." }, 500);
  }

  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(v => v.toString(16).padStart(2, "0")).join("");
  const pin_hash = await makeHash(salt, pin);
  const { error: pinError } = await admin.from("employee_pin_credentials").upsert({
    employee_id: created.user.id, pin_salt: salt, pin_hash, updated_at: new Date().toISOString(),
  });
  if (pinError) {
    await admin.from("profiles").delete().eq("id", created.user.id);
    await admin.auth.admin.deleteUser(created.user.id);
    return reply({ error: "Enregistrement du code personnel impossible." }, 500);
  }

  return reply({ success: true, employee: { id: created.user.id, full_name: name } });
});
