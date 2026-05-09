import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminAuthResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: Response };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function requireAdminBearer(request: Request): Promise<AdminAuthResult> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, response: json({ error: "Missing bearer token" }, 401) };
  const { data: userRes, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userRes.user) return { ok: false, response: json({ error: "Invalid session" }, 401) };
  const { data: roles } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userRes.user.id);
  if (!(roles ?? []).some((r) => r.role === "admin")) {
    return { ok: false, response: json({ error: "Admin role required" }, 403) };
  }
  return { ok: true, userId: userRes.user.id, email: userRes.user.email ?? null };
}