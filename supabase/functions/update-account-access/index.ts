import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return json({ error: "Connexion requise." }, 401);

  const client = createClient(url, anon, { global: { headers: { Authorization: header } } });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json({ error: "Session invalide." }, 401);

  const admin = createClient(url, service);
  const { data: manager } = await admin.from("profiles")
    .select("role,access_level,active").eq("id", auth.user.id).single();
  if (!manager?.active || manager.role !== "manager" || manager.access_level !== "manager_advanced") {
    return json({ error: "Action réservée au manager avancé." }, 403);
  }

  let body: { account_id?: string; access_level?: string; active?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Requête invalide." }, 400); }
  const accountId = String(body.account_id || "");
  const access = body.access_level;
  const active = body.active;
  if (!accountId || (access === undefined && active === undefined)) {
    return json({ error: "Compte ou modification manquante." }, 400);
  }
  if (access !== undefined && !["employee", "manager_simple", "manager_advanced"].includes(access)) {
    return json({ error: "Niveau d'accès invalide." }, 400);
  }
  if (active !== undefined && typeof active !== "boolean") {
    return json({ error: "Statut de compte invalide." }, 400);
  }

  const { data: target, error: targetError } = await admin.from("profiles")
    .select("id,role,access_level,active,full_name")
    .eq("id", accountId).single();
  if (targetError || !target) return json({ error: "Compte introuvable." }, 404);

  const nextAccess = access === undefined
    ? (target.access_level || (target.role === "manager" ? "manager_advanced" : "employee"))
    : access;
  const nextActive = active === undefined ? target.active : active;
  const demotingOrDisablingAdvanced = target.role === "manager" &&
    target.access_level === "manager_advanced" &&
    (nextAccess !== "manager_advanced" || nextActive === false);

  if (target.id === auth.user.id && demotingOrDisablingAdvanced) {
    return json({ error: "Tu ne peux pas retirer tes propres droits de manager avancé." }, 409);
  }

  if (demotingOrDisablingAdvanced) {
    const { count, error: countError } = await admin.from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "manager").eq("access_level", "manager_advanced").eq("active", true);
    if (countError) return json({ error: "Impossible de vérifier les comptes administrateurs." }, 500);
    if ((count || 0) <= 1) {
      return json({ error: "Il faut conserver au moins un manager avancé actif." }, 409);
    }
  }

  const update: Record<string, unknown> = {};
  if (access !== undefined) {
    update.access_level = access;
    update.role = access === "employee" ? "employee" : "manager";
  }
  if (active !== undefined) update.active = active;
  const { error: updateError } = await admin.from("profiles").update(update).eq("id", accountId);
  if (updateError) return json({ error: "Impossible de mettre à jour le compte." }, 500);

  return json({
    success: true,
    account: { id: target.id, full_name: target.full_name, access_level: nextAccess, active: nextActive },
  });
});
