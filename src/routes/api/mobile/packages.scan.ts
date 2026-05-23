import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { clientNameFromPayload, clientPhoneFromPayload, resolvePackageClient } from "@/server/clients";
import { enforceRateLimit } from "@/server/rate-limit";
import { withIdempotency } from "@/server/idempotency";

type PackageStatus =
  | "pending"
  | "received_in_china"
  | "processing"
  | "in_transit"
  | "arrived_destination"
  | "cleared"
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
  "cleared",
  "out_for_delivery",
  "delivered",
  "on_hold",
  "cancelled",
]);

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

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
          const limited = await enforceRateLimit({ request, endpoint: "scan", userId: auth.userId, max: 120, windowSeconds: 60 });
          if (limited) return limited;
          const trackingForKey = String(body.tracking_number ?? body.tracking_id ?? body.external_barcode ?? body.remark ?? "").trim();
          return withIdempotency({
            request,
            userId: auth.userId,
            endpoint: `scan:${body.action ?? "default"}:${trackingForKey}`,
            run: async () => {

          let trackingNumber = String(body.tracking_number ?? body.tracking_id ?? body.external_barcode ?? body.remark ?? "").trim();
          if (!trackingNumber) return badRequest("tracking_number required");

          const statusRaw = statusForScan(body);
          if (!PACKAGE_STATUSES.has(statusRaw as PackageStatus)) return badRequest(`invalid package status: ${statusRaw}`);
          const status = statusRaw as PackageStatus;

          const { data: existing, error: findErr } = await (supabaseAdmin.from("packages") as any)
            .select("*, clients(full_name, whatsapp_number)")
            .or(`tracking_number.eq.${trackingNumber},external_barcode.eq.${trackingNumber},remark.eq.${trackingNumber}`)
            .maybeSingle();
          if (findErr) throw findErr;
          if (existing?.tracking_number) trackingNumber = existing.tracking_number;

          let pkg: any = existing;
          let created = false;
          const qrPayload = body.qr_data ? normalizeScanBody({ qr_data: body.qr_data }) : body;
          const clientId = await resolvePackageClient(body);
          const customerName = clientNameFromPayload(body);
          const customerPhone = clientPhoneFromPayload(body);

          if (!pkg) {
            if (status !== "received_in_china") return notFound("package not found for this tracking number");
            const billingUnit = body.billing_unit ?? (body.mode === "sea" ? "cbm" : "kg");
            const billableQuantity = body.billable_quantity ?? (billingUnit === "cbm" ? body.cbm : body.weight_kg) ?? null;
            const totalCharge = body.total_charge ?? body.shipping_cost ?? null;

            const { data: inserted, error: insertErr } = await (supabaseAdmin.from("packages") as any)
              .insert({
                tracking_number: trackingNumber,
                external_barcode: body.external_barcode ?? null,
                route_code: body.route_code ?? null,
                description: body.description ?? "Auto-registered from mobile scan",
                client_id: clientId,
                sender_name: customerName || null,
                sender_phone: customerPhone || null,
                shipper_name: body.shipper_name ?? null,
                shipper_phone: body.shipper_phone ?? null,
                shipper_company: body.shipper_company ?? null,
                shipper_address: body.shipper_address ?? null,
                consignee_company: body.consignee_company ?? null,
                consignee_address: body.consignee_address ?? null,
                category: body.category ?? null,
                cargo_type: body.cargo_type ?? (body.mode === "special" ? "special" : "general"),
                special_cargo_type: body.special_cargo_type ?? null,
                mode: body.mode ?? "air",
                weight_kg: body.weight_kg ?? null,
                cbm: body.cbm ?? null,
                chargeable_weight_kg: numberOrNull(body.chargeable_weight_kg),
                piece_count: numberOrNull(body.piece_count),
                billing_unit: billingUnit,
                billable_quantity: billableQuantity,
                rate_amount: body.rate_amount ?? null,
                declared_amount: numberOrNull(body.declared_amount),
                declared_currency: body.declared_currency ?? null,
                payment_type: body.payment_type ?? null,
                insurance_charge: numberOrNull(body.insurance_charge),
                other_charge: numberOrNull(body.other_charge),
                freight_charge: numberOrNull(body.freight_charge),
                origin_total_charge: numberOrNull(body.origin_total_charge),
                origin_currency: body.origin_currency ?? null,
                remark: body.remark ?? null,
                shipping_cost: totalCharge,
                total_charge: totalCharge,
                warehouse_photo_url: body.photo_url ?? body.warehouse_photo_url ?? null,
                origin: body.origin ?? "China",
                destination_country: body.destination_country ?? "Kenya",
                destination_city: body.destination_city ?? null,
                status: "received_in_china",
                received_at: new Date().toISOString(),
                current_location: body.location ?? "China warehouse",
                qr_payload: qrPayload,
              })
              .select("*, clients(full_name, whatsapp_number)")
              .single();
            if (insertErr) throw insertErr;
            pkg = inserted;
            created = true;
          }

          const patch: any = { status };
          if (status === "received_in_china") patch.received_at = pkg.received_at ?? new Date().toISOString();
          if (status === "arrived_destination") patch.arrived_at = new Date().toISOString();
          if (status === "delivered") patch.delivered_at = new Date().toISOString();
          if (body.location) patch.current_location = body.location;
          if (qrPayload) patch.qr_payload = qrPayload;
          if (body.photo_url && status === "received_in_china") patch.warehouse_photo_url = body.photo_url;
          if (!pkg.client_id && clientId) patch.client_id = clientId;
          if (!pkg.sender_name && customerName) patch.sender_name = customerName;
          if (!pkg.sender_phone && customerPhone) patch.sender_phone = customerPhone;
          ["external_barcode", "route_code", "shipper_name", "shipper_phone", "shipper_company", "shipper_address", "consignee_company", "consignee_address", "category", "cargo_type", "special_cargo_type", "mode", "weight_kg", "cbm", "chargeable_weight_kg", "piece_count", "billing_unit", "billable_quantity", "rate_amount", "declared_amount", "declared_currency", "payment_type", "insurance_charge", "other_charge", "freight_charge", "origin_total_charge", "origin_currency", "remark", "total_charge"].forEach((key) => {
            if (body[key] !== undefined && (pkg as any)[key] == null) patch[key] = body[key];
          });
          if ((body.total_charge ?? body.shipping_cost) !== undefined && !pkg.shipping_cost) patch.shipping_cost = body.total_charge ?? body.shipping_cost;

          if (!created && status === "received_in_china" && pkg.status !== "pending") {
            const duplicatePatch = { ...patch };
            delete duplicatePatch.status;
            delete duplicatePatch.received_at;
            if (Object.keys(duplicatePatch).length > 0) {
              const { data: updated, error: dupErr } = await (supabaseAdmin.from("packages") as any)
                .update(duplicatePatch)
                .eq("id", pkg.id)
                .select("*, clients(full_name, whatsapp_number)")
                .single();
              if (dupErr) throw dupErr;
              pkg = updated;
            }
            return apiJson({ ok: true, created: false, duplicate: true, package: pkg });
          }

          if (!created && status === "arrived_destination" && ["arrived_destination", "cleared", "out_for_delivery", "delivered"].includes(pkg.status)) {
            return apiJson({ ok: true, created: false, duplicate: true, package: pkg, message: `Package is already ${String(pkg.status).replace(/_/g, " ")}.` });
          }

          const { data: updatedPkg, error: upErr } = await (supabaseAdmin.from("packages") as any)
            .update(patch)
            .eq("id", pkg.id)
            .select("*, clients(full_name, whatsapp_number)")
            .single();
          if (upErr) throw upErr;
          pkg = updatedPkg ?? { ...pkg, ...patch };

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
              try {
                const { sendPushToAudience } = await import("@/server/push");
                await sendPushToAudience("kenya", {
                  title: `Irregular arrival: ${pkg.tracking_number}`,
                  body: `Marked as ${status.replace(/_/g, " ")} but never loaded into a batch.`,
                  data: { type: "irregular_arrival", package_id: String(pkg.id) },
                });
              } catch (e) {
                console.error("push fan-out failed", e);
              }
            }
          }

          const { data: ev, error: evErr } = await (supabaseAdmin
            .from("package_events") as any)
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
            },
          });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
