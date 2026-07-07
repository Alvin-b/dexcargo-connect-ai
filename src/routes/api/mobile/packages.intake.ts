import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";
import { getEmployeeByUserId } from "@/server/employees";
import { logAudit } from "@/server/audit";
import { withIdempotency } from "@/server/idempotency";
import { enforceRateLimit } from "@/server/rate-limit";

// POST /api/mobile/packages/intake
// Called by the Kenya warehouse app AFTER the employee photographs the sticker,
// runs /packages/extract-label, reviews the OCR output, and saves it.
//
// Body:
// {
//   tracking_number: string (required — from sticker or manual),
//   intake_photo_url: string (required — public URL from /uploads),
//   ocr_payload: object   (the extracted-label JSON, kept verbatim for audit),
//   ocr_confidence?: number,
//   customer_name?, customer_phone?, courier?, weight_kg?, destination_city?,
//   category?, description?, remark?, notes?
// }
export const Route = createFileRoute("/api/mobile/packages/intake")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const emp = await getEmployeeByUserId(auth.userId);
          if (!emp) return badRequest("no employee record for this user; contact an admin");
          if (emp.status !== "active") return badRequest("your employee account is suspended");

          const limited = await enforceRateLimit({ request, endpoint: "intake", userId: auth.userId, max: 120, windowSeconds: 60 });
          if (limited) return limited;

          const body = await readJson<any>(request);
          if (!body?.tracking_number) return badRequest("tracking_number required");
          if (!body?.intake_photo_url) return badRequest("intake_photo_url required (upload the sticker photo first)");
          const tracking = String(body.tracking_number).trim();

          return withIdempotency({
            request,
            userId: auth.userId,
            endpoint: `intake:${tracking}`,
            run: async () => {
              // Reject duplicates
              const { data: existing } = await (supabaseAdmin.from("packages") as any)
                .select("id, tracking_number, status, received_by_employee_id")
                .or(`tracking_number.eq.${tracking},external_barcode.eq.${tracking}`)
                .maybeSingle();
              if (existing) {
                return apiJson({
                  ok: true,
                  duplicate: true,
                  message: `Package already registered (status: ${existing.status})`,
                  package: existing,
                }, 200);
              }

              const now = new Date().toISOString();
              const { data: pkg, error } = await (supabaseAdmin.from("packages") as any)
                .insert({
                  tracking_number: tracking,
                  external_barcode: body.external_barcode ?? null,
                  sender_name: body.customer_name ?? null,
                  sender_phone: body.customer_phone ?? null,
                  description: body.description ?? null,
                  category: body.category ?? null,
                  remark: body.remark ?? null,
                  weight_kg: body.weight_kg ?? null,
                  cbm: body.cbm ?? null,
                  origin: body.origin ?? "China",
                  destination_country: "Kenya",
                  destination_city: body.destination_city ?? null,
                  mode: body.mode ?? "air",
                  cargo_type: body.cargo_type ?? "general",
                  currency: "KES",
                  intake_photo_url: body.intake_photo_url,
                  warehouse_photo_url: body.intake_photo_url,
                  ocr_payload: body.ocr_payload ?? null,
                  ocr_confidence: body.ocr_confidence ?? null,
                  received_by_employee_id: emp.id,
                  received_at: now,
                  status: "arrived_destination",
                  current_location: body.current_location ?? "Kenya warehouse",
                  payment_status: "pending",
                })
                .select().single();
              if (error) throw error;

              await supabaseAdmin.from("package_events").insert({
                package_id: pkg.id,
                status: "arrived_destination",
                location: "Kenya warehouse",
                notes: `Received via OCR intake by ${emp.employee_code} (${emp.full_name})`,
                created_by: auth.userId,
              });

              await logAudit({
                actorId: auth.userId,
                action: "package.received",
                resourceType: "package",
                resourceId: String(pkg.id),
                metadata: { tracking_number: tracking, employee_code: emp.employee_code, ocr_confidence: body.ocr_confidence ?? null },
                request,
              });

              return apiJson({ ok: true, package: pkg, received_by: emp }, 201);
            },
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});