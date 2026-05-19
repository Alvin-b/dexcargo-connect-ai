import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

// POST /api/mobile/push/register  { token, platform: 'android'|'ios'|'web', device_label? }
// DELETE /api/mobile/push/register { token }
export const Route = createFileRoute("/api/mobile/push/register")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<{ token: string; platform: string; device_label?: string }>(request);
          if (!body?.token) return badRequest("token required");
          if (!body.platform || !["android", "ios", "web"].includes(body.platform)) {
            return badRequest("platform must be android|ios|web");
          }
          const { error } = await supabaseAdmin
            .from("push_tokens")
            .upsert(
              {
                user_id: auth.userId,
                token: body.token,
                platform: body.platform,
                device_label: body.device_label ?? null,
                last_used_at: new Date().toISOString(),
              },
              { onConflict: "user_id,token" },
            );
          if (error) throw error;
          return apiJson({ ok: true });
        } catch (e) {
          return serverError(e);
        }
      },
      DELETE: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<{ token: string }>(request);
          if (!body?.token) return badRequest("token required");
          await supabaseAdmin
            .from("push_tokens")
            .delete()
            .eq("user_id", auth.userId)
            .eq("token", body.token);
          return apiJson({ ok: true });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});