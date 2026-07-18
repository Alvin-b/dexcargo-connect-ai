// Shared auth + helpers for /api/mobile/* endpoints.
// Authenticates either Supabase session JWTs or X-API-Key headers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuthResult =
  | {
      ok: true;
      userId: string;
      isStaff: boolean;
      isAdmin: boolean;
    }
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

function hasStaffRole(roleSet: Set<string>) {
  return ["admin", "sales_rep", "sales_manager", "logistics_manager"].some((role) =>
    roleSet.has(role),
  );
}

async function resolveUserId(request: Request) {
  const apiKey = request.headers.get("x-api-key");
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  async function resolveApiKey(rawKey: string) {
    const { data, error } = await supabaseAdmin.rpc("verify_api_key", { _raw_key: rawKey });
    if (!error && data) return data as string;
    return null;
  }

  if (apiKey) return resolveApiKey(apiKey);

  if (bearerToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearerToken);
    if (!error && data.user?.id) return data.user.id;
    return resolveApiKey(bearerToken);
  }

  return null;
}

export async function authenticate(
  request: Request,
  opts?: { requireAdmin?: boolean },
): Promise<AuthResult> {
  const userId = await resolveUserId(request);
  if (!userId) return { ok: false, response: json({ error: "Missing or invalid X-API-Key header or bearer token" }, 401) };

  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  const isAdmin = roleSet.has("admin");
  const isStaff = hasStaffRole(roleSet);
  if (!isStaff) return { ok: false, response: json({ error: "Forbidden: staff role required" }, 403) };
  if (opts?.requireAdmin && !isAdmin) return { ok: false, response: json({ error: "Forbidden: admin role required" }, 403) };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
  if ((profile as any)?.is_active === false) return { ok: false, response: json({ error: "Forbidden: staff account disabled" }, 403) };

  return { ok: true, userId, isStaff, isAdmin };
}

export async function readJson<T = any>(request: Request): Promise<T | null> {
  try { return (await request.json()) as T; } catch { return null; }
}

export function badRequest(message: string) { return apiJson({ error: message }, 400); }
export function notFound(message = "Not found") { return apiJson({ error: message }, 404); }

function readableServerError(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const value = e as Record<string, unknown>;
    for (const key of ["message", "error", "details", "hint"]) {
      if (typeof value[key] === "string") return value[key] as string;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return "Unknown server error";
    }
  }
  return String(e ?? "Unknown server error");
}

export function serverError(e: unknown) {
  const msg = readableServerError(e);
  console.error("API error:", msg);
  return apiJson({ error: msg }, 500);
}
