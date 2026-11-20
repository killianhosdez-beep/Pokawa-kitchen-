import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
}
async function makeHash(salt: string, pin: string) {
  return sha256(salt + ":" + pin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Méthode non autorisée." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return reply({ error: "Connexion requise." }, 401);

  const client = createClient(url, anon, { global: { headers: { Authorization: header } } });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Session invalide." }, 401);

  const admin = createClient(url, service);
  const { data: manager } = await admin.from("profiles")
    .select("role,access_level,active").eq("id", auth.user.id).single();
  if (!manager?.active || manager.role !== "manager" || manager.access_level !== "manager_advanced") {
    return reply({ error: "Action réservée au manager avancé." }, 403);
  }

  let body: { full_name?: string; pin?: string; access_level?: string };
  try { body = await req.json(); } catch { return reply({ error: "Requête invalide." }, 400); }
  const name = String(body.full_name || "").trim().replace(/\s+/g, " ");
  const pin = String(body.pin || "");
  const access = String(body.access_level || "employee");
  if (!name || name.length > 80 || !/^\d{4}$/.test(pin)) {
    return reply({ error: "Le nom et un code PIN de 4 chiffres sont obligatoires." }, 400);
  }
  if (!["employee", "manager_simple", "manager_advanced"].includes(access)) {
    return reply({ error: "Niveau d'accès invalide." }, 400);
  }

  const { data: existing, error: existingError } = await admin.from("profiles")
    .select("full_name").in("role", ["employee", "manager"]).eq("active", true);
  if (existingError) return reply({ error: "Impossible de vérifier les comptes existants." }, 500);
  if ((existing || []).some(p => String(p.full_name || "").trim().toLocaleLowerCase("fr-FR") === name.toLocaleLowerCase("fr-FR"))) {
    return reply({ error: "Un compte actif porte déjà ce nom." }, 409);
  }

  const fingerprint = await sha256(service.slice(0, 32) + ":" + pin);
  const { data: duplicatePin, error: duplicateError } = await admin.from("employee_pin_credentials")
    .select("employee_id").eq("pin_fingerprint", fingerprint).limit(1);
  if (duplicateError) return reply({ error: "Impossible de vérifier l'unicité du PIN." }, 500);
  if (duplicatePin?.length) return reply({ error: "Ce code PIN est déjà utilisé par un autre compte." }, 409);

  // Identifiants techniques générés côté serveur : aucun e-mail ou mot de passe à saisir par la personne.
  const internalId = crypto.randomUUID();
  const email = "staff-" + internalId + "@pokawa-kitchen.invalid";
  const randomPassword = crypto.randomUUID() + "-" + crypto.randomUUID() + "aA9!";
  const role = access === "employee" ? "employee" : "manager";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: randomPassword,
    email_confirm: true,
    user_metadata: { full_name: name, role, access_level: access },
  });
  if (createError || !created.user) {
    return reply({ error: createError?.message || "Création du compte impossible." }, 500);
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    email,
    full_name: name,
    role,
    access_level: access,
    active: true,
  }, { onConflict: "id" });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return reply({ error: "Enregistrement du profil impossible." }, 500);
  }

  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(v => v.toString(16).padStart(2, "0")).join("");
  const pin_hash = await makeHash(salt, pin);
  const { error: pinError } = await admin.from("employee_pin_credentials").insert({
    employee_id: created.user.id,
    pin_salt: salt,
    pin_hash,
    pin_fingerprint: fingerprint,
    updated_at: new Date().toISOString(),
  });
  if (pinError) {
    await admin.from("profiles").delete().eq("id", created.user.id);
    await admin.auth.admin.deleteUser(created.user.id);
    return reply({ error: "Enregistrement du code PIN impossible." }, 500);
  }

  return reply({ success: true, account: { id: created.user.id, full_name: name, access_level: access } });
});
