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
async function pinHash(salt: string, pin: string) {
  return sha256(`${salt}:${pin}`);
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let body: { action?: string; full_name?: string; pin?: string };
  try { body = await req.json(); } catch { return json({ error: "Requête invalide." }, 400); }

  const admin = createClient(url, serviceKey);
  if (body.action === "list") {
    const { data: employees, error } = await admin.from("profiles")
      .select("full_name").eq("role", "employee").eq("active", true).order("full_name");
    if (error) return json({ error: "Impossible de charger la liste des employés." }, 500);
    return json({ employees: (employees || []).filter(e => e.full_name).map(e => ({ full_name: e.full_name, active: true })) });
  }

  const fullName = String(body.full_name || "").trim();
  const pin = String(body.pin || "");
  if (!fullName || fullName.length > 80 || !/^\d{4}$/.test(pin)) return json({ error: "Nom ou code personnel invalide." }, 400);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = await sha256(ip + serviceKey.slice(0, 16));
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await admin.from("employee_pin_attempts").select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).gte("created_at", cutoff);
  if ((count || 0) >= 10) return json({ error: "Trop de tentatives. Réessaie dans 15 minutes." }, 429);
  await admin.from("employee_pin_attempts").insert({ employee_name: fullName.toLowerCase(), ip_hash: ipHash });

  const { data: employees, error: profileError } = await admin.from("profiles")
    .select("id,email,full_name,role,active")
    .eq("full_name", fullName).eq("role", "employee").eq("active", true).limit(2);
  if (profileError || !employees?.length) return json({ error: "Nom ou code personnel incorrect." }, 401);
  if (employees.length !== 1) return json({ error: "Plusieurs employés portent ce nom. Contacte un manager." }, 409);

  const employee = employees[0];
  const { data: credential } = await admin.from("employee_pin_credentials")
    .select("pin_salt,pin_hash").eq("employee_id", employee.id).single();
  if (!credential || !safeEqual(await pinHash(credential.pin_salt, pin), credential.pin_hash)) {
    return json({ error: "Nom ou code personnel incorrect." }, 401);
  }
  if (!employee.email) return json({ error: "Le compte employé n'a pas d'adresse interne configurée." }, 500);

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink", email: employee.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return json({ error: "Impossible d'ouvrir la session employé." }, 500);
  return json({ token_hash: tokenHash });
});
