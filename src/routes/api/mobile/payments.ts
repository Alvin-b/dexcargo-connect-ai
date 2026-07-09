import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DarajaError, initiateStkPush, normalizeSafaricomPhone } from "@/server/daraja";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { withIdempotency } from "@/server/idempotency";
import { logAudit } from "@/server/audit";

export const Route = createFileRoute("/api/mobile/payments")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          let q: any = (supabaseAdmin.from("payments") as any)
            .select("*, packages(tracking_number), customers(full_name, phone)")
            .order("created_at", { ascending: false }).limit(limit);
          const status = url.searchParams.get("status"); if (status) q = q.eq("status", status);
          const customerId = url.searchParams.get("customer_id"); if (customerId) q = q.eq("customer_id", customerId);
          const packageId = url.searchParams.get("package_id"); if (packageId) q = q.eq("package_id", packageId);
          const { data, error } = await q;
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const limited = await enforceRateLimit({ request, endpoint: "stk", userId: auth.userId, max: 10, windowSeconds: 60 });
          if (limited) return limited;
          return withIdempotency({
            request, userId: auth.userId, endpoint: "stk-push",
            run: async () => {
              const body = await readJson<any>(request);
              if (!body?.phone) return badRequest("phone required");
              let phone: string;
              try { phone = normalizeSafaricomPhone(String(body.phone)); }
              catch (e: any) { return apiJson({ error: e?.safeMessage ?? "invalid phone" }, 400); }
              let packageId = body.package_id ?? null;
              let customerId = body.customer_id ?? null;
              let reference = body.reference ?? "Dexcargo";
              let amount = Number(body.amount);
              if (body.tracking_number) {
                const { data: pkg } = await (supabaseAdmin.from("packages") as any)
                  .select("id, customer_id, tracking_number, status, amount_due")
                  .eq("tracking_number", body.tracking_number).maybeSingle();
                if (pkg) {
                  packageId = pkg.id; customerId = pkg.customer_id;
                  reference = pkg.tracking_number;
                  if (!amount || !(amount > 0)) amount = Number(pkg.amount_due ?? 0);
                }
              }
              if (!(amount > 0)) return badRequest("amount must be greater than zero");
              const r = await initiateStkPush({
                phone, amount, accountReference: reference,
                description: body.description ?? `DEX ${reference}`,
                packageId: packageId ?? undefined, clientId: customerId ?? undefined,
                initiatedBy: auth.userId, purpose: "package_clearance",
              });
              await logAudit({ actorId: auth.userId, action: "payment.stk_initiated", resourceType: "package", resourceId: packageId, metadata: { amount, reference }, request });
              return apiJson({ ok: true, checkout_request_id: r.CheckoutRequestID, merchant_request_id: r.MerchantRequestID, payment: r.payment });
            },
          });
        } catch (e) {
          if (e instanceof DarajaError) return apiJson({ error: e.safeMessage, code: e.code }, e.status);
          return serverError(e);
        }
      },
    },
  },
});