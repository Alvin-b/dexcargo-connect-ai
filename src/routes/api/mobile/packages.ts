import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";
import { getEmployeeByUserId } from "@/server/employees";
import { withIdempotency } from "@/server/idempotency";

// GET /api/mobile/packages — list with filters
// POST /api/mobile/packages — intake (on-device OCR payload + sticker photo)
export const Route = createFileRoute("/api/mobile/packages")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
          let q: any = (supabaseAdmin.from("packages") as any)
            .select("*, customers(full_name, phone, whatsapp_number)", { count: "exact" })
            .order("received_at", { ascending: false }).range(offset, offset + limit - 1);
          const status = url.searchParams.get("status"); if (status) q = q.eq("status", status);
          const customerId = url.searchParams.get("customer_id"); if (customerId) q = q.eq("customer_id", customerId);
          const employeeId = url.searchParams.get("employee_id"); if (employeeId) q = q.eq("received_by_employee_id", employeeId);
          const since = url.searchParams.get("since"); if (since) q = q.gte("received_at", since);
          const until = url.searchParams.get("until"); if (until) q = q.lte("received_at", until);
          const search = url.searchParams.get("q");
          if (search) q = q.or(`tracking_number.ilike.%${search}%,external_barcode.ilike.%${search}%,description.ilike.%${search}%,supplier.ilike.%${search}%`);
          const { data, count, error } = await q;
          if (error) throw error;
          return apiJson({ data, count, limit, offset });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const emp = await getEmployeeByUserId(auth.userId);
          if (!emp || emp.status !== "active") return badRequest("active employee record required");
          const body = await readJson<any>(request);
          if (!body?.tracking_number) return badRequest("tracking_number required");
          if (!body?.intake_photo_url) return badRequest("intake_photo_url required");
          const tracking = String(body.tracking_number).trim();

          return withIdempotency({
            request, userId: auth.userId, endpoint: `intake:${tracking}`,
            run: async () => {
              const { data: existing } = await (supabaseAdmin.from("packages") as any)
                .select("id, tracking_number, status").eq("tracking_number", tracking).maybeSingle();
              if (existing) return apiJson({ ok: true, duplicate: true, package: existing }, 200);

              // resolve/create customer if provided
              let customerId: string | null = body.customer_id ?? null;
              if (!customerId && body.customer_phone) {
                const phone = String(body.customer_phone).replace(/\s+/g, "");
                const { data: cust } = await (supabaseAdmin.from("customers") as any)
                  .select("id").eq("phone", phone).maybeSingle();
                if (cust) customerId = cust.id;
                else if (body.customer_name) {
                  const { data: newCust } = await (supabaseAdmin.from("customers") as any)
                    .insert({ full_name: body.customer_name, phone, whatsapp_number: body.customer_whatsapp ?? phone, created_by: auth.userId })
                    .select("id").single();
                  customerId = newCust?.id ?? null;
                }
              }

              const { data: pkg, error } = await (supabaseAdmin.from("packages") as any).insert({
                tracking_number: tracking,
                external_barcode: body.external_barcode ?? null,
                second_tracking_number: body.second_tracking_number ?? null,
                customer_id: customerId,
                supplier: body.supplier ?? null,
                description: body.description ?? null,
                category: body.category ?? null,
                weight_kg: body.weight_kg ?? null,
                chargeable_weight_kg: body.chargeable_weight_kg ?? null,
                volume_m3: body.volume_m3 ?? null,
                pieces: body.pieces ?? null,
                nature_of_goods: body.nature_of_goods ?? null,
                payment_type: body.payment_type ?? null,
                declared_value: body.declared_value ?? null,
                declared_currency: body.declared_currency ?? null,
                shipping_method: body.shipping_method ?? null,
                shipping_cost: body.shipping_cost ?? null,
                remark: body.remark ?? null,
                origin: body.origin ?? null,
                route_code: body.route_code ?? null,
                cargo_type: body.cargo_type ?? null,
                zone: body.zone ?? null,
                rack: body.rack ?? null,
                warehouse_id: body.warehouse_id ?? null,
                shelf_id: body.shelf_id ?? null,
                bin_code: body.bin_code ?? null,
                sales_rep_employee_id: body.sales_rep_employee_id ?? null,
                sales_manager_employee_id: body.sales_manager_employee_id ?? null,
                length_cm: body.length_cm ?? null,
                width_cm: body.width_cm ?? null,
                height_cm: body.height_cm ?? null,
                courier: body.courier ?? null,
                destination_city: body.destination_city ?? null,
                special_notes: body.special_notes ?? null,
                amount_due: body.amount_due ?? 0,
                intake_photo_url: body.intake_photo_url,
                ocr_payload: body.ocr_payload ?? null,
                ocr_confidence: body.ocr_confidence ?? null,
                received_by_employee_id: emp.id,
                status: body.status ?? 'registered',
              }).select("*, customers(full_name, phone, whatsapp_number)").single();
              if (error) throw error;

              await (supabaseAdmin.from("package_images") as any).insert({
                package_id: pkg.id, kind: "sticker", url: body.intake_photo_url,
                uploaded_by: auth.userId, captured_by: auth.userId,
              });
              // Optional package photo captured after OCR review
              if (body.package_photo_url) {
                await (supabaseAdmin.from("package_images") as any).insert({
                  package_id: pkg.id, kind: "package", url: body.package_photo_url,
                  uploaded_by: auth.userId, captured_by: auth.userId,
                  gps_lat: body.gps_lat ?? null, gps_lng: body.gps_lng ?? null,
                });
              }
              return apiJson({ ok: true, package: pkg }, 201);
            },
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});