import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, notFound, serverError } from "@/server/api-auth";

// Close a batch and detect left-behind packages.
// POST /api/mobile/batches/:id/close
export const Route = createFileRoute("/api/mobile/batches/$id/close")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;

          const { data: batch } = await supabaseAdmin.from("loading_batches").select("*").eq("id", params.id).maybeSingle();
          if (!batch) return notFound("batch not found");

          // Run left-behind detection (creates a notification + updates left_behind_total)
          const { data: leftBehind, error: lbErr } = await supabaseAdmin.rpc("detect_left_behind", { _batch_id: batch.id });
          if (lbErr) throw lbErr;

          await supabaseAdmin.from("loading_batches")
            .update({ status: "closed", closed_at: new Date().toISOString() })
            .eq("id", batch.id);

          return apiJson({ ok: true, left_behind: leftBehind ?? [] });
        } catch (e) { return serverError(e); }
      },
    },
  },
});
