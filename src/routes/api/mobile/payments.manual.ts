import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { getEmployeeByUserId } from "@/server/employees";
import { logAudit } from "@/server/audit";
import { withIdempotency } from "@/server/idempotency";

// POST /api/mobile/payments/manual
// Cashier records a payment against a package without going through STK push.
// Body: { package_id, amount, method: 'cash'|'mpesa'|'bank', mpesa_code?, reference?, notes? }
export const Route = createFileRoute("/api/mobile/payments/manual")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const emp = await getEmployeeByUserId(auth.userId);
          if (!emp) return badRequest("no employee record for this user");
          if (emp.status !== "active") return badRequest("your employee account is suspended");

          const body = await readJson<any>(request);
          if (!body?.package_id) return badRequest("package_id required");
          if (!body?.method || !["cash","mpesa","bank"].includes(body.method)) return badRequest("method must be cash|mpesa|bank");
          const amount = Number(body.amount);
          if (!(amount > 0)) return badRequest("amount must be greater than zero");
          if (body.method === "mpesa" && !body.mpesa_code) return badRequest("mpesa_code required for method=mpesa");

          const mpesaCode = body.mpesa_code ? String(body.mpesa_code).trim().toUpperCase() : null;

          return withIdempotency({
            request, userId: auth.userId, endpoint: `manual-pay:${body.package_id}:${mpesaCode ?? amount}`,
            run: async () => {
              const { data: pkg } = await (supabaseAdmin.from("packages") as any)
                .select("id, tracking_number, client_id, sender_phone").eq("id", body.package_id).maybeSingle();
              if (!pkg) return notFound("package not found");

              const { data: pay, error } = await supabaseAdmin.from("payments").insert({
                package_id: pkg.id,
                client_id: pkg.client_id,
                amount,
                currency: "KES",
                phone: pkg.sender_phone ?? "counter",
                status: "success",
                method: body.method,
                mpesa_code: mpesaCode,
                recorded_by_employee_id: emp.id,
                raw_callback: {
                  method: body.method,
                  recorded_by_employee_code: emp.employee_code,
                  reference: body.reference ?? pkg.tracking_number,
                  notes: body.notes ?? null,
                },
              }).select().single();
              if (error) {
                if (String(error.message).includes("uniq_payments_mpesa_code")) return badRequest("this M-Pesa code was already used for another payment");
                throw error;
              }

              await (supabaseAdmin.from("packages") as any).update({
                payment_status: "paid",
                payment_method: body.method,
                mpesa_code: mpesaCode,
              }).eq("id", pkg.id);

              await logAudit({
                actorId: auth.userId,
                action: `payment.manual.${body.method}`,
                resourceType: "package",
                resourceId: String(pkg.id),
                metadata: { amount, mpesa_code: mpesaCode, employee_code: emp.employee_code },
                request,
              });

              return apiJson({ ok: true, payment: pay }, 201);
            },
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});