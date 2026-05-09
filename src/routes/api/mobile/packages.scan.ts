import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";

// Scan-to-receive: one-tap status update via QR/barcode (tracking_number).
// Body: { tracking_number, status?, location?, notes?, photo_url? }
// Defaults to "received_in_china" — perfect for warehouse arrival scans.
export const Route = createFileRoute("/api/mobile/packages/scan")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.tracking_number) return badRequest("tracking_number required");
          const status = body.status ?? "received_in_china";

          const { data: pkg, error: findErr } = await supabaseAdmin
            .from("packages")
            .select("*, clients(full_name, whatsapp_number)")
            .eq("tracking_number", body.tracking_number)
            .maybeSingle();
          if (findErr) throw findErr;
          if (!pkg) return notFound("package not found for this tracking number");

          const patch: any = { status };
          if (status === "received_in_china") patch.received_at = new Date().toISOString();
          if (status === "delivered") patch.delivered_at = new Date().toISOString();
          if (body.photo_url && status === "received_in_china") patch.warehouse_photo_url = body.photo_url;

          const { error: upErr } = await supabaseAdmin.from("packages").update(patch).eq("id", pkg.id);
          if (upErr) throw upErr;

          // Irregular arrival detection: package marked as arrived/delivered without ever being loaded into a batch
          if (status === "arrived_in_kenya" || status === "delivered" || status === "ready_for_pickup") {
            const { data: bp } = await supabaseAdmin.from("batch_packages")
              .select("id").eq("package_id", pkg.id).limit(1).maybeSingle();
            if (!bp) {
              await supabaseAdmin.from("notifications").insert({
                type: "irregular_arrival", severity: "warning", audience: "kenya",
                title: `Irregular arrival: ${pkg.tracking_number}`,
                body: `Package marked as ${status.replace(/_/g, " ")} but was never loaded into a batch.`,
                package_id: pkg.id,
                data: { status, scanned_by: auth.userId },
              });
            }
          }

          const { data: ev, error: evErr } = await supabaseAdmin.from("package_events").insert({
            package_id: pkg.id,
            status,
            location: body.location ?? null,
            notes: body.notes ?? "Scanned via mobile app",
            photo_url: body.photo_url ?? null,
            created_by: auth.userId,
          }).select().single();
          if (evErr) throw evErr;

          // Best-effort WhatsApp notification (don't fail the scan if it errors)
          const client = (pkg as any).clients;
          if (client?.whatsapp_number) {
            try {
              const { sendWhatsAppText } = await import("@/server/evolution");
              await sendWhatsAppText(
                client.whatsapp_number,
                `Hi ${client.full_name}, your package ${pkg.tracking_number} status is now: ${status.replace(/_/g, " ")}.`
              );
              await supabaseAdmin.from("package_events").update({ notified_client: true }).eq("id", ev.id);
            } catch (e) {
              console.error("scan notify failed", e);
            }
          }

          return apiJson({ ok: true, package: { ...pkg, ...patch }, event: ev });
        } catch (e) { return serverError(e); }
      },
    },
  },
});