import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";
import { clientNameFromPayload, clientPhoneFromPayload, resolvePackageClient } from "@/server/clients";

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
          if (q) query = query.or(`tracking_number.ilike.%${q}%,description.ilike.%${q}%,sender_name.ilike.%${q}%,sender_phone.ilike.%${q}%,category.ilike.%${q}%`);
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
          if (!body?.tracking_number) return badRequest("tracking_number required");
          if (!body?.warehouse_photo_url) return badRequest("warehouse_photo_url required");
          if (!body?.client_id && !clientNameFromPayload(body) && !clientPhoneFromPayload(body)) {
            return badRequest("provide at least one of: client_id, sender_name/customer_name, sender_phone/customer_phone");
          }
          const billingUnit = body.billing_unit ?? (body.mode === "sea" ? "cbm" : "kg");
          const billableQuantity = body.billable_quantity ?? (billingUnit === "cbm" ? body.cbm : body.weight_kg);
          const totalCharge = body.total_charge ?? body.shipping_cost ?? null;
          const clientId = await resolvePackageClient(body);
          const customerName = clientNameFromPayload(body);
          const customerPhone = clientPhoneFromPayload(body);
          const { data, error } = await (supabaseAdmin.from("packages") as any).insert({
            client_id: clientId,
            tracking_number: body.tracking_number,
            sender_name: customerName || null,
            sender_phone: customerPhone || null,
            description: body.description ?? null,
            category: body.category ?? null,
            cargo_type: body.cargo_type ?? (body.mode === "special" ? "special" : "general"),
            special_cargo_type: body.special_cargo_type ?? null,
            mode: body.mode ?? "air",
            weight_kg: body.weight_kg ?? null,
            cbm: body.cbm ?? null,
            billing_unit: billingUnit,
            billable_quantity: billableQuantity ?? null,
            rate_amount: body.rate_amount ?? null,
            length_cm: body.length_cm ?? null,
            width_cm: body.width_cm ?? null,
            height_cm: body.height_cm ?? null,
            declared_value: body.declared_value ?? null,
            shipping_cost: totalCharge,
            total_charge: totalCharge,
            currency: body.currency ?? "KES",
            origin: body.origin ?? "China",
            destination_country: body.destination_country ?? "Kenya",
            destination_city: body.destination_city ?? null,
            status: body.status ?? "pending",
            warehouse_photo_url: body.warehouse_photo_url ?? null,
            estimated_arrival: body.estimated_arrival ?? null,
          }).select().single();
          if (error) throw error;
          return apiJson(data, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
