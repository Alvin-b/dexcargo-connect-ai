import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, serverError } from "@/server/api-auth";
import { logAudit } from "@/server/audit";

export const Route = createFileRoute("/api/mobile/rates/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      PATCH: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const { data, error } = await supabaseAdmin.from("rates").update(body ?? {}).eq("id", params.id).select().maybeSingle();
          if (error) throw error;
          await logAudit({
            actorId: auth.userId,
            action: "rate.updated",
            resourceType: "rate",
            resourceId: String(params.id),
            metadata: body ?? {},
            request,
          });
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
      DELETE: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const { error } = await supabaseAdmin.from("rates").delete().eq("id", params.id);
          if (error) throw error;
          await logAudit({
            actorId: auth.userId,
            action: "rate.deleted",
            resourceType: "rate",
            resourceId: String(params.id),
            request,
          });
          return apiJson({ ok: true });
        } catch (e) { return serverError(e); }
      },
    },
  },
});