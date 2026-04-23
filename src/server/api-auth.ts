// Shared auth + helpers for /api/mobile/* endpoints.
// Authenticates by X-API-Key header against employee_api_keys via verify_api_key().
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuthResult =
  | { ok: true; userId: string; isStaff: boolean; isAdmin: boolean }
  | { ok: false; response: Response };

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      ...extraHeaders,
    },
  });
}

export const apiJson = json;

export function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function authenticate(request: Request, opts?: { requireAdmin?: boolean }): Promise<AuthResult> {
  const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!apiKey) return { ok: false, response: json({ error: "Missing X-API-Key header" }, 401) };

  const { data: userId, error } = await supabaseAdmin.rpc("verify_api_key", { _raw_key: apiKey });
  if (error || !userId) return { ok: false, response: json({ error: "Invalid or revoked API key" }, 401) };

  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  const isAdmin = roleSet.has("admin");
  const isStaff = isAdmin || roleSet.has("staff");
  if (!isStaff) return { ok: false, response: json({ error: "Forbidden: staff role required" }, 403) };
  if (opts?.requireAdmin && !isAdmin) return { ok: false, response: json({ error: "Forbidden: admin role required" }, 403) };

  return { ok: true, userId, isStaff, isAdmin };
}

export async function readJson<T = any>(request: Request): Promise<T | null> {
  try { return (await request.json()) as T; } catch { return null; }
}

export function badRequest(message: string) { return apiJson({ error: message }, 400); }
export function notFound(message = "Not found") { return apiJson({ error: message }, 404); }
export function serverError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("API error:", msg);
  return apiJson({ error: msg }, 500);
}