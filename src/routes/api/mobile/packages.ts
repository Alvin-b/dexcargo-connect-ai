import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";
import { clientNameFromPayload, clientPhoneFromPayload, resolvePackageClient } from "@/server/clients";
import { computeQuote } from "@/server/quote";

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

async function nextTrackingNumber() {
  try {
    const { data, error } = await (supabaseAdmin as any).rpc("generate_dex_tracking_number");
    if (!error && data) return String(data);
  } catch {
    // Fall back below if the migration has not reached an environment yet.
  }
  return `DCX-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
}

export const Route = createFileRoute("/api/mobile/packages")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const status = url.searchParams.get("status");
          const clientId = url.searchParams.get("client_id");
          const senderPhone = url.searchParams.get("sender_phone");
          const q = url.searchParams.get("q");
          const sort = url.searchParams.get("sort");
          const mode = url.searchParams.get("mode");
          const cargoType = url.searchParams.get("cargo_type");
          const specialCargoType = url.searchParams.get("special_cargo_type");
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
          let query = supabaseAdmin.from("packages").select("*, clients(full_name, whatsapp_number)", { count: "exact" });
          if (sort === "received_at_asc") {
            query = query.order("received_at", { ascending: true, nullsFirst: false });
          } else {
            query = query.order("created_at", { ascending: false });
          }
          query = query.range(offset, offset + limit - 1);
          if (status) query = query.eq("status", status as any);
          if (clientId) query = query.eq("client_id", clientId);
          if (senderPhone) query = query.eq("sender_phone", senderPhone.replace(/\D/g, ""));
          if (mode) query = query.eq("mode", mode as any);
          if (cargoType) query = (query as any).eq("cargo_type", cargoType);
          if (specialCargoType) query = (query as any).eq("special_cargo_type", specialCargoType);
          if (q) query = query.or(`tracking_number.ilike.%${q}%,external_barcode.ilike.%${q}%,remark.ilike.%${q}%,description.ilike.%${q}%,sender_name.ilike.%${q}%,sender_phone.ilike.%${q}%,category.ilike.%${q}%`);
          const { data, count, error } = await query;
          if (error) throw error;
          return apiJson({ data, count, limit, offset });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.client_id && !clientNameFromPayload(body) && !clientPhoneFromPayload(body)) {
            return badRequest("provide at least one of: client_id, sender_name/customer_name, sender_phone/customer_phone");
          }
          const trackingNumber = String(body.tracking_number ?? "").trim() || await nextTrackingNumber();
          const mode = String(body.mode ?? "air") as "air" | "sea" | "express" | "special";
          const cargoType = (body.cargo_type ?? (mode === "special" ? "special" : "general")) as "general" | "special";
          const weightKg = numberOrNull(body.weight_kg);
          const cbm = numberOrNull(body.cbm);
          const billingUnit = body.billing_unit ?? (mode === "sea" ? "cbm" : "kg");
          const billableQuantity = numberOrNull(body.billable_quantity) ?? (billingUnit === "cbm" ? cbm : weightKg);
          let totalCharge = numberOrNull(body.total_charge) ?? numberOrNull(body.shipping_cost);
          let rateAmount = numberOrNull(body.rate_amount);
          let quote: any = null;
          if (!totalCharge) {
            quote = await computeQuote({
              destinationCountry: body.destination_country ?? "Kenya",
              mode,
              category: body.category ?? undefined,
              cargoType,
              specialCargoType: body.special_cargo_type ?? undefined,
              weightKg: weightKg ?? undefined,
              cbm: cbm ?? undefined,
            } as any);
            if (quote?.ok) {
              totalCharge = quote.cost;
              rateAmount = quote.unit === "cbm" ? Number(quote.rate?.price_per_cbm ?? 0) : Number(quote.rate?.price_per_kg ?? 0);
            }
          }
          const clientId = await resolvePackageClient(body);
          const customerName = clientNameFromPayload(body);
          const customerPhone = clientPhoneFromPayload(body);
          const status = body.status ?? "received_in_china";
          const receivedAt = status === "received_in_china" ? (body.received_at ?? new Date().toISOString()) : body.received_at ?? null;
          const qrPayload = body.qr_payload ?? {
            tracking_number: trackingNumber,
            external_barcode: body.external_barcode ?? undefined,
            route_code: body.route_code ?? undefined,
            remark: body.remark ?? undefined,
            customer_name: customerName || undefined,
            customer_phone: customerPhone || undefined,
            mode,
            cargo_type: cargoType,
            special_cargo_type: body.special_cargo_type ?? undefined,
            destination_country: body.destination_country ?? "Kenya",
          };
          const { data, error } = await (supabaseAdmin.from("packages") as any).insert({
            client_id: clientId,
            tracking_number: trackingNumber,
            external_barcode: body.external_barcode ?? null,
            route_code: body.route_code ?? null,
            sender_name: customerName || null,
            sender_phone: customerPhone || null,
            shipper_name: body.shipper_name ?? null,
            shipper_phone: body.shipper_phone ?? null,
            shipper_company: body.shipper_company ?? null,
            shipper_address: body.shipper_address ?? null,
            consignee_company: body.consignee_company ?? null,
            consignee_address: body.consignee_address ?? null,
            description: body.description ?? null,
            category: body.category ?? null,
            cargo_type: cargoType,
            special_cargo_type: body.special_cargo_type ?? null,
            mode,
            weight_kg: weightKg,
            cbm,
            chargeable_weight_kg: numberOrNull(body.chargeable_weight_kg),
            piece_count: numberOrNull(body.piece_count),
            billing_unit: billingUnit,
            billable_quantity: billableQuantity,
            rate_amount: rateAmount,
            length_cm: numberOrNull(body.length_cm),
            width_cm: numberOrNull(body.width_cm),
            height_cm: numberOrNull(body.height_cm),
            declared_value: numberOrNull(body.declared_value) ?? numberOrNull(body.declared_amount),
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
            currency: body.currency ?? "KES",
            origin: body.origin ?? "China",
            destination_country: body.destination_country ?? "Kenya",
            destination_city: body.destination_city ?? null,
            status,
            warehouse_photo_url: body.warehouse_photo_url ?? null,
            received_at: receivedAt,
            current_location: body.current_location ?? (status === "received_in_china" ? "China warehouse" : null),
            qr_payload: qrPayload,
            estimated_arrival: body.estimated_arrival ?? null,
          }).select("*, clients(full_name, whatsapp_number)").single();
          if (error) throw error;
          await supabaseAdmin.from("package_events").insert({
            package_id: data.id,
            status,
            location: body.current_location ?? "China warehouse",
            notes: body.notes ?? "Package created from mobile app",
            created_by: auth.userId,
          });
          return apiJson({ ok: true, package: data, quote, qr_payload: qrPayload }, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
