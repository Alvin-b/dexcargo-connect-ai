import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, notFound, serverError } from "@/server/api-auth";
import { sendPushToAudience } from "@/server/push";
import { logAudit } from "@/server/audit";

// Close a batch and detect left-behind packages.
// POST /api/mobile/batches/:id/close
export const Route = createFileRoute("/api/mobile/batches/$id/close")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { location: "china" });
          if (!auth.ok) return auth.response;

          const { data: batch } = await supabaseAdmin.from("loading_batches").select("*").eq("id", params.id).maybeSingle();
          if (!batch) return notFound("batch not found");

          // Run left-behind detection (creates a notification + updates left_behind_total)
          const { data: leftBehind, error: lbErr } = await supabaseAdmin.rpc("detect_left_behind", { _batch_id: batch.id });
          if (lbErr) throw lbErr;

          await supabaseAdmin.from("loading_batches")
            .update({ status: "closed", closed_at: new Date().toISOString() })
            .eq("id", batch.id);

          const leftCount = Array.isArray(leftBehind) ? leftBehind.length : 0;
          try {
            await sendPushToAudience("all", {
              title: `Batch ${batch.batch_code} closed`,
              body: leftCount > 0 ? `${leftCount} package(s) left behind.` : "All packages loaded.",
              data: { type: "batch_closed", batch_id: String(batch.id) },
            });
          } catch (e) { console.error("push fail", e); }
          await logAudit({
            actorId: auth.userId,
            action: "batch.closed",
            resourceType: "loading_batch",
            resourceId: String(batch.id),
            metadata: { batch_code: batch.batch_code, left_behind_count: leftCount },
            request,
          });

          return apiJson({ ok: true, left_behind: leftBehind ?? [] });
        } catch (e) { return serverError(e); }
      },
    },
  },
});
