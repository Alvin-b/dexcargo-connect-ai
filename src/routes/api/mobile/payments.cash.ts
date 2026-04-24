import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";

// Record a cash payment (no STK push). Marks the payment as success immediately.
// Body: { amount, package_id?, tracking_number?, client_id?, phone?, currency?, notes? }
export const Route = createFileRoute("/api/mobile/payments/cash")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.amount) return badRequest("amount required");

          let packageId: string | null = body.package_id ?? null;
          let clientId: string | null = body.client_id ?? null;
          let phone: string = body.phone ?? "";

          if (!packageId && body.tracking_number) {
            const { data: pkg } = await supabaseAdmin.from("packages")
              .select("id, client_id, sender_phone").eq("tracking_number", body.tracking_number).maybeSingle();
            if (!pkg) return notFound("package not found for this tracking number");
            packageId = pkg.id;
            clientId = clientId ?? pkg.client_id;
            if (!phone && pkg.sender_phone) phone = pkg.sender_phone;
          }

          const { data, error } = await supabaseAdmin.from("payments").insert({
            package_id: packageId,
            client_id: clientId,
            amount: Number(body.amount),
            phone: phone || "cash",
            currency: body.currency ?? "KES",
            status: "success",
            raw_callback: { method: "cash", recorded_by: auth.userId, notes: body.notes ?? null },
          }).select().single();
          if (error) throw error;
          return apiJson({ ok: true, payment: data }, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});