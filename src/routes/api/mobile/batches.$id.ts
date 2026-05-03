import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, notFound, serverError } from "@/server/api-auth";

// GET /api/mobile/batches/:id  -> batch + packages + FIFO queue + left-behind preview
export const Route = createFileRoute("/api/mobile/batches/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;

          const { data: batch } = await supabaseAdmin.from("loading_batches").select("*").eq("id", params.id).maybeSingle();
          if (!batch) return notFound("batch not found");

          // Loaded packages in this batch
          const { data: loaded } = await supabaseAdmin
            .from("batch_packages")
            .select("*, packages(*, clients(full_name, whatsapp_number))")
            .eq("batch_id", batch.id)
            .order("loaded_at", { ascending: true });

          // FIFO queue: packages received before cutoff, still in china, not yet in this batch
          const { data: queue } = await supabaseAdmin
            .from("packages")
            .select("id, tracking_number, sender_name, sender_phone, description, received_at, clients(full_name, whatsapp_number)")
            .eq("status", "received_in_china")
            .lte("received_at", batch.cutoff_at)
            .order("received_at", { ascending: true })
            .limit(500);

          const loadedIds = new Set((loaded ?? []).map((b: any) => b.package_id));
          const pending = (queue ?? []).filter((p: any) => !loadedIds.has(p.id));

          return apiJson({ batch, loaded, pending });
        } catch (e) { return serverError(e); }
      },
    },
  },
});
