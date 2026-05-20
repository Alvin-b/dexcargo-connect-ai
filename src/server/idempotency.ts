import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { apiJson } from "@/server/api-auth";

// Returns the cached response if the key was already used by this user+endpoint,
// otherwise calls `run`, persists, and returns the fresh response.
// Mobile clients should set `Idempotency-Key` on POST mutations they may retry.
export async function withIdempotency(opts: {
  request: Request;
  userId: string;
  endpoint: string;
  run: () => Promise<Response>;
}): Promise<Response> {
  const key = opts.request.headers.get("idempotency-key");
  if (!key) return opts.run();

  const { data: existing } = await supabaseAdmin
    .from("idempotency_keys")
    .select("response_status, response_body")
    .eq("user_id", opts.userId)
    .eq("endpoint", opts.endpoint)
    .eq("key", key)
    .maybeSingle();

  if (existing) {
    return apiJson(existing.response_body ?? { replayed: true }, existing.response_status);
  }

  const res = await opts.run();
  // Only cache successful 2xx outcomes.
  if (res.status >= 200 && res.status < 300) {
    try {
      const clone = res.clone();
      const body = await clone.json().catch(() => null);
      await supabaseAdmin.from("idempotency_keys").insert({
        user_id: opts.userId,
        endpoint: opts.endpoint,
        key,
        response_status: res.status,
        response_body: body,
      });
    } catch (e) {
      console.error("idempotency store failed", e);
    }
  }
  return res;
}