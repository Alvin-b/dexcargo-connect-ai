import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";

// POST /api/desktop/left-behind/:id/reassign  { batch_id }
// Move a left-behind package into a specified active batch.
export const Route = createFileRoute("/api/desktop/left-behind/$id/reassign")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { location: "china" });
          if (!auth.ok) return auth.response;
          const body = await readJson<{ batch_id?: string; notes?: string }>(request);
          if (!body?.batch_id) return badRequest("batch_id required");

          const { data: batch } = await supabaseAdmin
            .from("loading_batches").select("*").eq("id", body.batch_id).maybeSingle();
          if (!batch) return notFound("batch not found");
          if (batch.status !== "active") return badRequest("target batch is not active");

          const { data: pkg } = await supabaseAdmin
            .from("packages").select("*").eq("id", params.id).maybeSingle();
          if (!pkg) return notFound("package not found");

          // already in this batch?
          const { data: existing } = await supabaseAdmin
            .from("batch_packages").select("id")
            .eq("batch_id", batch.id).eq("package_id", pkg.id).maybeSingle();
          if (existing) return apiJson({ ok: true, already_loaded: true });

          const { data: bp, error: bpErr } = await supabaseAdmin.from("batch_packages").insert({
            batch_id: batch.id, package_id: pkg.id, loaded_by: auth.userId,
            notes: body.notes ?? "Reassigned from left-behind queue",
          }).select().single();
          if (bpErr) throw bpErr;

          const loadedAt = new Date().toISOString();
          await (supabaseAdmin.from("packages") as any).update({
            status: "in_transit",
            loaded_at: loadedAt,
            loading_batch_id: batch.id,
            current_location: "China loading bay",
          }).eq("id", pkg.id);

          await supabaseAdmin.from("package_events").insert({
            package_id: pkg.id, status: "in_transit",
            location: "China loading bay",
            notes: `Reassigned to batch ${batch.batch_code} from left-behind queue`,
            created_by: auth.userId,
          });

          await supabaseAdmin.from("loading_batches")
            .update({ loaded_total: (batch.loaded_total ?? 0) + 1 }).eq("id", batch.id);

          return apiJson({ ok: true, batch_package: bp });
        } catch (e) { return serverError(e); }
      },
    },
  },
});