import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";
import { logAudit } from "@/server/audit";

// POST /api/mobile/clients/:id/consent  { consent: boolean }
// Records the client's DPA consent for indefinite data retention (Kenya DPA).
// Captured at the clearance/signature step when the client picks up.
export const Route = createFileRoute("/api/mobile/clients/$id/consent")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { location: "kenya" });
          if (!auth.ok) return auth.response;
          const body = await readJson<{ consent: boolean }>(request);
          if (typeof body?.consent !== "boolean") return badRequest("consent (boolean) required");
          const { data, error } = await (supabaseAdmin.from("clients") as any)
            .update({ consent_data_retention: body.consent, updated_at: new Date().toISOString() })
            .eq("id", params.id)
            .select("id, full_name, consent_data_retention")
            .single();
          if (error) throw error;
          await logAudit({
            actorId: auth.userId,
            action: "client.consent.update",
            resourceType: "client",
            resourceId: params.id,
            metadata: { consent: body.consent },
            request,
          });
          return apiJson({ ok: true, client: data });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});