import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";

// Load a package into a batch (during loading mode).
// POST /api/mobile/batches/:id/scan  { tracking_number, override?: boolean, notes? }
// Enforces FIFO: warns if older packages are still pending unless override=true.
export const Route = createFileRoute("/api/mobile/batches/$id/scan")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { location: "china" });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.tracking_number) return badRequest("tracking_number required");

          const { data: batch } = await supabaseAdmin.from("loading_batches").select("*").eq("id", params.id).maybeSingle();
          if (!batch) return notFound("batch not found");
          if (batch.status !== "active") return badRequest("batch is not active");

          const { data: pkg } = await supabaseAdmin
            .from("packages").select("*, clients(full_name, whatsapp_number)")
            .eq("tracking_number", body.tracking_number).maybeSingle();
          if (!pkg) return notFound("package not found");

          // Already in this batch?
          const { data: existing } = await supabaseAdmin.from("batch_packages")
            .select("id").eq("batch_id", batch.id).eq("package_id", pkg.id).maybeSingle();
          if (existing) return apiJson({ ok: true, already_loaded: true, package: pkg });

          if (pkg.status !== "received_in_china") {
            return badRequest(`package cannot be loaded from status: ${pkg.status}`);
          }

          // FIFO check: any older received-in-china packages not yet loaded in this batch?
          if (!body.override && pkg.received_at) {
            const { data: older } = await supabaseAdmin
              .from("packages")
              .select("id, tracking_number, received_at")
              .eq("status", "received_in_china")
              .lt("received_at", pkg.received_at)
              .lte("received_at", batch.cutoff_at)
              .limit(5);
            const olderIds = (older ?? []).map((p: any) => p.id);
            if (olderIds.length > 0) {
              const { data: loadedOlder } = await supabaseAdmin.from("batch_packages")
                .select("package_id").eq("batch_id", batch.id).in("package_id", olderIds);
              const loadedSet = new Set((loadedOlder ?? []).map((b: any) => b.package_id));
              const stillPending = (older ?? []).filter((p: any) => !loadedSet.has(p.id));
              if (stillPending.length > 0) {
                return apiJson({
                  ok: false,
                  warning: "fifo_violation",
                  message: `${stillPending.length} older package(s) should be loaded first`,
                  older_pending: stillPending,
                }, 409);
              }
            }
          }

          // Insert into batch + flip status
          const { data: bp, error: bpErr } = await supabaseAdmin.from("batch_packages").insert({
            batch_id: batch.id, package_id: pkg.id, loaded_by: auth.userId, notes: body.notes ?? null,
          }).select().single();
          if (bpErr) throw bpErr;

          const loadedAt = new Date().toISOString();
          const { data: updatedPkg, error: pkgErr } = await (supabaseAdmin
            .from("packages") as any)
            .update({
              status: "in_transit",
              loaded_at: loadedAt,
              loading_batch_id: batch.id,
              current_location: body.location ?? "China loading bay",
            })
            .eq("id", pkg.id)
            .select("*, clients(full_name, whatsapp_number)")
            .single();
          if (pkgErr) throw pkgErr;

          await supabaseAdmin.from("package_events").insert({
            package_id: pkg.id, status: "in_transit",
            location: body.location ?? "China loading bay",
            notes: `Loaded into batch ${batch.batch_code}`, created_by: auth.userId,
          });

          // Bump loaded_total
          await supabaseAdmin.from("loading_batches")
            .update({ loaded_total: (batch.loaded_total ?? 0) + 1 }).eq("id", batch.id);

          return apiJson({ ok: true, batch_package: bp, package: updatedPkg ?? pkg }, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
