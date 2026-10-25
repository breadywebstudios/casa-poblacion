// Casa Poblacion — manage admin users (list / add / remove).
// Only callers who are already Casa admins may use it.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // Who is calling, and are they a Casa admin?
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Please sign in again." }, 401);
  const { data: isAdmin } = await caller.rpc("casa_is_admin");
  if (!isAdmin) return json({ error: "Only Casa Poblacion admins can manage users." }, 403);
  const me = (user.email ?? "").toLowerCase();

  const db = createClient(url, service, { auth: { persistSession: false } });
  let body: { action?: string; email?: string; password?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const email = (body.email ?? "").trim().toLowerCase();

  if (body.action === "list") {
    const { data, error } = await db.from("casa_admins").select("email, added_by, created_at").order("created_at");
    if (error) return json({ error: error.message }, 500);
    return json({ admins: data, me });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    return json({ error: "Please enter a valid email address." }, 400);
  }

  if (body.action === "add") {
    const password = body.password ?? "";
    const { data: existing, error: lookErr } = await db.rpc("casa_auth_user_exists", { p_email: email });
    if (lookErr) return json({ error: lookErr.message }, 500);
    if (!existing) {
      if (password.length < 8) {
        return json({ error: "Set a temporary password of at least 8 characters for the new user." }, 400);
      }
      const { error: createErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (createErr) return json({ error: createErr.message }, 400);
    }
    // Existing logins keep their current password.
    const { error } = await db.from("casa_admins").upsert({ email, added_by: me }, { onConflict: "email", ignoreDuplicates: true });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, existing });
  }

  if (body.action === "remove") {
    if (email === me) return json({ error: "You can't remove your own access." }, 400);
    const { count } = await db.from("casa_admins").select("email", { count: "exact", head: true });
    if ((count ?? 0) <= 1) return json({ error: "At least one admin must remain." }, 400);
    // Only removes admin access — the login itself may be used by other sites in this project.
    const { error } = await db.from("casa_admins").delete().eq("email", email);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
