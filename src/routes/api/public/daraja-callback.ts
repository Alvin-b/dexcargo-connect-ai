import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { apiJson, preflight, serverError } from "@/server/api-auth";
import { transitionStatus, awardCommission } from "@/server/packages";

// POST /api/public/daraja-callback — Safaricom STK callback
export const Route = createFileRoute("/api/public/daraja-callback")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const body: any = await request.json().catch(() => ({}));
          const cb = body?.Body?.stkCallback;
          if (!cb) return apiJson({ ok: true });
          const checkoutId = cb.CheckoutRequestID;
          const success = cb.ResultCode === 0;
          const meta = cb.CallbackMetadata?.Item ?? [];
          const mpesaCode = meta.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value ?? null;
          const amount = Number(meta.find((i: any) => i.Name === "Amount")?.Value ?? 0);

          const { data: payment } = await (supabaseAdmin.from("payments") as any)
            .select("*").eq("checkout_request_id", checkoutId).maybeSingle();
          if (!payment) return apiJson({ ok: true });

          await (supabaseAdmin.from("payments") as any).update({
            status: success ? "success" : "failed",
            mpesa_receipt: mpesaCode,
            raw_callback: body,
          }).eq("id", payment.id);

          if (success && payment.package_id) {
            const { data: pkg } = await (supabaseAdmin.from("packages") as any)
              .select("id, status, amount_paid, received_by_employee_id").eq("id", payment.package_id).maybeSingle();
            if (pkg) {
              await (supabaseAdmin.from("packages") as any)
                .update({ amount_paid: Number(pkg.amount_paid ?? 0) + amount }).eq("id", pkg.id);
              try {
                if (pkg.status === "awaiting_payment") await transitionStatus(pkg.id, "paid", null);
              } catch {/* ignore */}
              if (pkg.received_by_employee_id) await awardCommission(pkg.id, pkg.received_by_employee_id, "payment", amount, payment.id);
            }
          }
          return apiJson({ ok: true });
        } catch (e) { return serverError(e); }
      },
    },
  },
});