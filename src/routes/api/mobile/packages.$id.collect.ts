import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { getEmployeeByUserId } from "@/server/employees";
import { transitionStatus, awardCommission } from "@/server/packages";
import { withIdempotency } from "@/server/idempotency";
import { logAudit } from "@/server/audit";

// POST /api/mobile/packages/:id/collect
// { collected_by_name (required), collected_by_id_number?, collected_by_phone?, relationship?, signature_url?, proof_photo_url?, payment?: {method, amount, mpesa_code?} }
export const Route = createFileRoute("/api/mobile/packages/$id/collect")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const emp = await getEmployeeByUserId(auth.userId);
          if (!emp || emp.status !== "active") return badRequest("active employee required");
          const body = await readJson<any>(request);
          if (!body?.collected_by_name) return badRequest("collected_by_name required");

          return withIdempotency({
            request, userId: auth.userId, endpoint: `collect:${params.id}`,
            run: async () => {
              const { data: pkg } = await (supabaseAdmin.from("packages") as any)
                .select("id, tracking_number, status, amount_due, amount_paid, customer_id").eq("id", params.id).maybeSingle();
              if (!pkg) return notFound("package not found");

              // record inline cash/mpesa payment if provided
              let paymentId: string | undefined;
              if (body.payment && body.payment.method) {
                const amount = Number(body.payment.amount ?? Math.max(0, Number(pkg.amount_due ?? 0) - Number(pkg.amount_paid ?? 0)));
                if (!(amount > 0)) return badRequest("payment.amount required");
                const { data: pay, error } = await (supabaseAdmin.from("payments") as any).insert({
                  package_id: pkg.id, customer_id: pkg.customer_id, amount, currency: "KES",
                  phone: body.collected_by_phone ?? "counter", status: "success",
                }).select().single();
                if (error) throw error;
                paymentId = pay.id;
                await (supabaseAdmin.from("packages") as any).update({ amount_paid: Number(pkg.amount_paid ?? 0) + amount }).eq("id", pkg.id);
                await awardCommission(pkg.id, emp.id, "payment", amount, paymentId);
              }

              // transition ready -> collected (may need to bump through paid)
              if (pkg.status !== "ready_for_collection") {
                try { await transitionStatus(pkg.id, "ready_for_collection", emp.id, "auto before collect"); } catch { /* ignore */ }
              }
              await transitionStatus(pkg.id, "collected", emp.id, `collected by ${body.collected_by_name}`);

              const { data: delivery, error: delErr } = await (supabaseAdmin.from("deliveries") as any).insert({
                package_id: pkg.id,
                collected_by_name: body.collected_by_name,
                collected_by_id_number: body.collected_by_id_number ?? null,
                collected_by_phone: body.collected_by_phone ?? null,
                relationship_to_customer: body.relationship ?? null,
                signature_url: body.signature_url ?? null,
                proof_photo_url: body.proof_photo_url ?? null,
                released_by_employee_id: emp.id,
              }).select().single();
              if (delErr) throw delErr;
              await awardCommission(pkg.id, emp.id, "delivery", 0);
              await logAudit({ actorId: auth.userId, action: "package.collected", resourceType: "package", resourceId: pkg.id, metadata: { employee_code: emp.employee_code }, request });
              return apiJson({ ok: true, delivery, payment_id: paymentId ?? null }, 201);
            },
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});