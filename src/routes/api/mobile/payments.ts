import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { initiateStkPush } from "@/server/daraja";
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
          const auth = await authenticate(request, { location: "kenya" });
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const status = url.searchParams.get("status");
          const clientId = url.searchParams.get("client_id");
          const packageId = url.searchParams.get("package_id");
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          let q = supabaseAdmin.from("payments").select("*, clients(full_name, whatsapp_number), packages(tracking_number)").order("created_at", { ascending: false }).limit(limit);
          if (status) q = q.eq("status", status as any);
          if (clientId) q = q.eq("client_id", clientId);
          if (packageId) q = q.eq("package_id", packageId);
          const { data, error } = await q;
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request, { location: "kenya" });
          if (!auth.ok) return auth.response;
          // Hard cap: max 10 STK pushes per minute per staff member.
          const limited = await enforceRateLimit({ request, endpoint: "stk", userId: auth.userId, max: 10, windowSeconds: 60 });
          if (limited) return limited;
          return withIdempotency({
            request,
            userId: auth.userId,
            endpoint: "stk-push",
            run: async () => {
          const body = await readJson<any>(request);
          if (!body?.phone) return badRequest("phone required");
          let packageId = body.package_id ?? null;
          let clientId = body.client_id ?? null;
          let reference = body.reference ?? "Dexcargo";
          let amount = Number(body.amount ?? 0);
          if (body.tracking_number) {
            const { data: pkg } = await (supabaseAdmin.from("packages") as any)
              .select("id, client_id, tracking_number, status, shipping_cost, total_charge, payment_status")
              .eq("tracking_number", body.tracking_number)
              .maybeSingle();
            if (pkg) {
              packageId = pkg.id;
              clientId = pkg.client_id;
              reference = pkg.tracking_number;
              amount = amount || Number(pkg.total_charge ?? pkg.shipping_cost ?? 0);
              if (pkg.payment_status === "paid") return badRequest("package payment is already marked as paid");
              if (!["arrived_destination", "cleared", "out_for_delivery"].includes(pkg.status)) {
                return badRequest("package must be arrived in Kenya before pickup payment");
              }
            }
          }
          if (!amount || amount <= 0) return badRequest("amount required");
          const r = await initiateStkPush({
            phone: String(body.phone),
            amount,
            accountReference: reference,
            description: body.description ?? `DEX ${reference}`,
            packageId: packageId ?? undefined,
            clientId: clientId ?? undefined,
            initiatedBy: auth.userId,
            purpose: "package_clearance",
          });
          if (packageId) {
            await (supabaseAdmin.from("packages") as any).update({
              payment_status: "pending",
              payment_method: "mpesa",
            }).eq("id", packageId);
          }
          await logAudit({
            actorId: auth.userId,
            action: "payment.stk_initiated",
            resourceType: "package",
            resourceId: packageId ? String(packageId) : null,
            metadata: { amount, phone: body.phone, reference, checkout_request_id: r.CheckoutRequestID },
            request,
          });
          return apiJson({
            ok: true,
            checkout_request_id: r.CheckoutRequestID,
            merchant_request_id: r.MerchantRequestID,
            payment: r.payment,
          });
            },
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});
