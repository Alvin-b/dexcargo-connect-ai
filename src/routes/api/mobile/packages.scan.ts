import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";

type PackageStatus =
  | "pending"
  | "received_in_china"
  | "processing"
  | "in_transit"
  | "arrived_destination"
  | "out_for_delivery"
  | "delivered"
  | "on_hold"
  | "cancelled";

const PACKAGE_STATUSES = new Set<PackageStatus>([
  "pending",
  "received_in_china",
  "processing",
  "in_transit",
  "arrived_destination",
  "out_for_delivery",
  "delivered",
  "on_hold",
  "cancelled",
]);

// Scan-to-receive: one-tap status update via QR/barcode.
// action=receive marks China receipt; action=arrive marks Kenya arrival.
function normalizeScanBody(body: any) {
  if (body?.qr_data && typeof body.qr_data === "string") {
    try {
      return { ...JSON.parse(body.qr_data), ...body };
    } catch {
      return { ...body, tracking_number: body.qr_data };
    }
  }
  return body ?? {};
}

function statusForScan(body: any): string {
  if (body.status === "arrived_kenya" || body.status === "ready_for_pickup") return "arrived_destination";
  if (body.status) return String(body.status);
  if (body.action === "arrive") return "arrived_destination";
  if (body.action === "deliver") return "delivered";
  return "received_in_china";
}

export const Route = createFileRoute("/api/mobile/packages/scan")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const rawBody = await readJson<any>(request);
          const body = normalizeScanBody(rawBody);
          const requiredLocation = body.action === "arrive" ? "kenya" : body.action === "receive" ? "china" : undefined;
          const auth = await authenticate(request, requiredLocation ? { location: requiredLocation } : undefined);
          if (!auth.ok) return auth.response;

          const trackingNumber = body.tracking_number ?? body.tracking_id;
          if (!trackingNumber) return badRequest("tracking_number required");
          const statusRaw = statusForScan(body);
          if (!PACKAGE_STATUSES.has(statusRaw as PackageStatus)) return badRequest(`invalid package status: ${statusRaw}`);
          const status = statusRaw as PackageStatus;

          const { data: existing, error: findErr } = await supabaseAdmin
            .from("packages")
            .select("*, clients(full_name, whatsapp_number)")
            .eq("tracking_number", trackingNumber)
            .maybeSingle();
          if (findErr) throw findErr;

          let pkg = existing;
          let created = false;
          if (!pkg) {
            if (status !== "received_in_china") return notFound("package not found for this tracking number");
            const { data: inserted, error: insertErr } = await supabaseAdmin
              .from("packages")
              .insert({
                tracking_number: trackingNumber,
                description: body.description ?? "Auto-registered from mobile scan",
                sender_name: body.sender_name ?? body.name ?? null,
                sender_phone: body.sender_phone ? String(body.sender_phone).replace(/\D/g, "") : null,
                warehouse_photo_url: body.photo_url ?? body.warehouse_photo_url ?? null,
                origin: body.origin ?? "China",
                destination_country: body.destination_country ?? "Kenya",
                destination_city: body.destination_city ?? null,
                status: "received_in_china",
                received_at: new Date().toISOString(),
              })
              .select("*, clients(full_name, whatsapp_number)")
              .single();
            if (insertErr) throw insertErr;
            pkg = inserted;
            created = true;
          }

          const patch: any = { status };
          if (status === "received_in_china") patch.received_at = new Date().toISOString();
          if (status === "delivered") patch.delivered_at = new Date().toISOString();
          if (body.photo_url && status === "received_in_china") patch.warehouse_photo_url = body.photo_url;

          const { error: upErr } = await supabaseAdmin.from("packages").update(patch).eq("id", pkg.id);
          if (upErr) throw upErr;

          if (status === "arrived_destination" || status === "out_for_delivery" || status === "delivered") {
            const { data: bp } = await supabaseAdmin
              .from("batch_packages")
              .select("id")
              .eq("package_id", pkg.id)
              .limit(1)
              .maybeSingle();
            if (!bp) {
              await supabaseAdmin.from("notifications").insert({
                type: "irregular_arrival",
                severity: "warning",
                audience: "kenya",
                title: `Irregular arrival: ${pkg.tracking_number}`,
                body: `Package marked as ${status.replace(/_/g, " ")} but was never loaded into a batch.`,
                package_id: pkg.id,
                data: { status, scanned_by: auth.userId },
              });
            }
          }

          const { data: ev, error: evErr } = await supabaseAdmin
            .from("package_events")
            .insert({
              package_id: pkg.id,
              status,
              location: body.location ?? null,
              notes: body.notes ?? (created ? "Registered from mobile scan" : "Scanned via mobile app"),
              photo_url: body.photo_url ?? null,
              created_by: auth.userId,
            })
            .select()
            .single();
          if (evErr) throw evErr;

          const client = (pkg as any).clients;
          if (client?.whatsapp_number) {
            try {
              const { sendWhatsAppText } = await import("@/server/evolution");
              await sendWhatsAppText(
                client.whatsapp_number,
                `Hi ${client.full_name}, your package ${pkg.tracking_number} status is now: ${status.replace(/_/g, " ")}.`,
              );
              await supabaseAdmin.from("package_events").update({ notified_client: true }).eq("id", ev.id);
            } catch (e) {
              console.error("scan notify failed", e);
            }
          }

          return apiJson({ ok: true, created, package: { ...pkg, ...patch }, event: ev });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
