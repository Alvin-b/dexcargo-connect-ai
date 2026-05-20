import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { apiJson } from "@/server/api-auth";

// Best-effort distributed rate limit backed by Postgres.
// Returns null when allowed, or a 429 Response when blocked.
export async function enforceRateLimit(opts: {
  request: Request;
  endpoint: string;
  userId?: string | null;
  max: number;
  windowSeconds: number;
}): Promise<Response | null> {
  const ip =
    opts.request.headers.get("cf-connecting-ip") ||
    opts.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const key = `${opts.endpoint}:${opts.userId ?? ip}`;
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _bucket: key,
      _max: opts.max,
      _window_seconds: opts.windowSeconds,
    });
    if (error) return null; // fail-open on infra error
    if (data === false) {
      return apiJson(
        { error: "Too many requests. Please slow down." },
        429,
        { "Retry-After": String(opts.windowSeconds) },
      );
    }
  } catch {
    // fail-open
  }
  return null;
}