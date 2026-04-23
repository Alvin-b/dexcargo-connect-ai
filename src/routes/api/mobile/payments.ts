import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { initiateStkPush } from "@/server/daraja";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/payments")({
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
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.phone || !body?.amount) return badRequest("phone and amount required");
          let packageId = body.package_id ?? null;
          let clientId = body.client_id ?? null;
          let reference = body.reference ?? "Dexcargo";
          if (body.tracking_number) {
            const { data: pkg } = await supabaseAdmin.from("packages").select("id, client_id, tracking_number").eq("tracking_number", body.tracking_number).maybeSingle();
            if (pkg) { packageId = pkg.id; clientId = pkg.client_id; reference = pkg.tracking_number; }
          }
          const r = await initiateStkPush({
            phone: String(body.phone),
            amount: Number(body.amount),
            accountReference: reference,
            description: body.description ?? `Dexcargo ${reference}`,
            packageId: packageId ?? undefined,
            clientId: clientId ?? undefined,
          });
          return apiJson({ ok: true, checkout_request_id: r.CheckoutRequestID, merchant_request_id: r.MerchantRequestID });
        } catch (e) { return serverError(e); }
      },
    },
  },
});