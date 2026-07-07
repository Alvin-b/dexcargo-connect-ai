import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { getEmployeeByUserId } from "@/server/employees";
import { withIdempotency } from "@/server/idempotency";
import { enforceRateLimit } from "@/server/rate-limit";
import { logAudit } from "@/server/audit";

// POST /api/mobile/packages/:id/release
// The counter agent releases a paid package to a walk-in customer.
// Body:
// {
//   recipient_name (required),
//   recipient_id_number?, recipient_phone?,
//   payment: { method: 'mpesa'|'cash'|'bank', amount, mpesa_code?, reference? } (optional if payment already recorded),
//   notes?
// }
export const Route = createFileRoute("/api/mobile/packages/$id/release")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const emp = await getEmployeeByUserId(auth.userId);
          if (!emp) return badRequest("no employee record for this user");
          if (emp.status !== "active") return badRequest("your employee account is suspended");
          const limited = await enforceRateLimit({ request, endpoint: "release", userId: auth.userId, max: 60, windowSeconds: 60 });
          if (limited) return limited;

          return withIdempotency({
            request, userId: auth.userId, endpoint: `release:${params.id}`,
            run: async () => {
              const body = await readJson<any>(request);
              if (!body?.recipient_name) return badRequest("recipient_name required");

              const { data: pkg } = await (supabaseAdmin.from("packages") as any)
                .select("id, tracking_number, status, payment_status, total_charge, shipping_cost, client_id, sender_name, sender_phone")
                .eq("id", params.id).maybeSingle();
              if (!pkg) return notFound("package not found");
              if (pkg.status === "released" || pkg.status === "cleared") {
                return badRequest(`package already ${pkg.status}`);
              }

              // Handle inline payment recording
              let paymentRow: any = null;
              let mpesaCode: string | null = null;
              if (body.payment && body.payment.method) {
                const amount = Number(body.payment.amount ?? pkg.total_charge ?? pkg.shipping_cost ?? 0);
                if (!(amount > 0)) return badRequest("payment.amount must be greater than zero");
                mpesaCode = body.payment.mpesa_code ? String(body.payment.mpesa_code).trim().toUpperCase() : null;
                const insertPay: any = {
                  package_id: pkg.id,
                  client_id: pkg.client_id,
                  amount,
                  currency: "KES",
                  phone: pkg.sender_phone ?? "counter",
                  status: "success",
                  method: body.payment.method,
                  mpesa_code: mpesaCode,
                  recorded_by_employee_id: emp.id,
                  raw_callback: {
                    method: body.payment.method,
                    recorded_by_employee_code: emp.employee_code,
                    reference: body.payment.reference ?? pkg.tracking_number,
                    notes: body.notes ?? null,
                  },
                };
                const { data: pay, error: payErr } = await supabaseAdmin.from("payments").insert(insertPay).select().single();
                if (payErr) {
                  if (String(payErr.message).includes("uniq_payments_mpesa_code")) return badRequest("this M-Pesa code was already used for another payment");
                  throw payErr;
                }
                paymentRow = pay;
              } else if (pkg.payment_status !== "paid") {
                // No inline payment and not marked paid → check for any successful payment on file
                const { data: existingPay } = await supabaseAdmin
                  .from("payments").select("id, mpesa_code, method")
                  .eq("package_id", pkg.id).eq("status", "success").limit(1).maybeSingle();
                if (!existingPay) return badRequest("package is not paid — record a payment (cash/mpesa) as part of this release");
                paymentRow = existingPay;
                mpesaCode = existingPay.mpesa_code ?? null;
              }

              const releasedAt = new Date().toISOString();
              const { data: updated, error: upErr } = await (supabaseAdmin.from("packages") as any).update({
                status: "cleared",
                payment_status: "paid",
                payment_method: paymentRow?.method ?? "mpesa",
                mpesa_code: mpesaCode,
                recipient_name: body.recipient_name,
                recipient_id_number: body.recipient_id_number ?? null,
                recipient_phone: body.recipient_phone ?? null,
                released_at: releasedAt,
                released_by_employee_id: emp.id,
                delivered_at: releasedAt,
                cleared_at: releasedAt,
              }).eq("id", pkg.id).select().single();
              if (upErr) throw upErr;

              await supabaseAdmin.from("package_events").insert({
                package_id: pkg.id,
                status: "cleared",
                notes: `Released to ${body.recipient_name}${body.recipient_id_number ? ` (ID ${body.recipient_id_number})` : ""} by ${emp.employee_code}`,
                created_by: auth.userId,
              });

              await logAudit({
                actorId: auth.userId,
                action: "package.released",
                resourceType: "package",
                resourceId: String(pkg.id),
                metadata: {
                  tracking_number: pkg.tracking_number,
                  employee_code: emp.employee_code,
                  recipient_name: body.recipient_name,
                  recipient_id_number: body.recipient_id_number ?? null,
                  payment_method: paymentRow?.method ?? null,
                  mpesa_code: mpesaCode,
                  amount: paymentRow?.amount ?? null,
                },
                request,
              });

              return apiJson({ ok: true, package: updated, payment: paymentRow, released_by: emp }, 201);
            },
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});