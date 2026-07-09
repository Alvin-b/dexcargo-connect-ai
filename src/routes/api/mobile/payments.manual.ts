import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { getEmployeeByUserId } from "@/server/employees";
import { awardCommission } from "@/server/packages";
import { logAudit } from "@/server/audit";
import { withIdempotency } from "@/server/idempotency";

// POST /api/mobile/payments/manual  { package_id, amount, method, mpesa_code?, notes? }
export const Route = createFileRoute("/api/mobile/payments/manual")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const emp = await getEmployeeByUserId(auth.userId);
          if (!emp || emp.status !== "active") return badRequest("active employee required");
          const body = await readJson<any>(request);
          if (!body?.package_id) return badRequest("package_id required");
          if (!body?.method) return badRequest("method required");
          const amount = Number(body.amount);
          if (!(amount > 0)) return badRequest("amount must be > 0");
          const code = body.mpesa_code ? String(body.mpesa_code).trim().toUpperCase() : null;

          return withIdempotency({
            request, userId: auth.userId, endpoint: `manual-pay:${body.package_id}:${code ?? amount}`,
            run: async () => {
              const { data: pkg } = await (supabaseAdmin.from("packages") as any)
                .select("id, customer_id, amount_paid").eq("id", body.package_id).maybeSingle();
              if (!pkg) return notFound("package not found");
              const { data: pay, error } = await (supabaseAdmin.from("payments") as any).insert({
                package_id: pkg.id, customer_id: pkg.customer_id, amount, currency: "KES",
                phone: body.phone ?? "counter", status: "success",
              }).select().single();
              if (error) throw error;
              await (supabaseAdmin.from("packages") as any)
                .update({ amount_paid: Number(pkg.amount_paid ?? 0) + amount }).eq("id", pkg.id);
              await awardCommission(pkg.id, emp.id, "payment", amount, pay.id);
              await logAudit({ actorId: auth.userId, action: `payment.manual.${body.method}`, resourceType: "package", resourceId: pkg.id, metadata: { amount, mpesa_code: code, employee_code: emp.employee_code }, request });
              return apiJson({ ok: true, payment: pay }, 201);
            },
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});