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
          const auth = await authenticate(request, { location: "kenya" });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          let amount = Number(body?.amount ?? 0);

          let packageId: string | null = body.package_id ?? null;
          let clientId: string | null = body.client_id ?? null;
          let phone: string = body.phone ?? "";

          if (!packageId && body.tracking_number) {
            const { data: pkg } = await (supabaseAdmin.from("packages") as any)
              .select("id, client_id, sender_phone, status, payment_status, total_charge, shipping_cost").eq("tracking_number", body.tracking_number).maybeSingle();
            if (!pkg) return notFound("package not found for this tracking number");
            if (pkg.payment_status === "paid") return badRequest("package payment is already marked as paid");
            if (!["arrived_destination", "out_for_delivery"].includes(pkg.status)) {
              return badRequest("package must be arrived in Kenya before pickup payment");
            }
            packageId = pkg.id;
            clientId = clientId ?? pkg.client_id;
            if (!phone && pkg.sender_phone) phone = pkg.sender_phone;
            amount = amount || Number(pkg.total_charge ?? pkg.shipping_cost ?? 0);
          }
          if (!amount || amount <= 0) return badRequest("amount required");

          const { data, error } = await supabaseAdmin.from("payments").insert({
            package_id: packageId,
            client_id: clientId,
            amount,
            phone: phone || "cash",
            currency: body.currency ?? "KES",
            status: "success",
            raw_callback: { method: "cash", recorded_by: auth.userId, notes: body.notes ?? null },
          }).select().single();
          if (error) throw error;

          if (packageId) {
            await (supabaseAdmin
              .from("packages") as any)
              .update({
                payment_status: "paid",
                payment_method: "cash",
              })
              .eq("id", packageId);
            await (supabaseAdmin.from("package_events") as any).insert({
              package_id: packageId,
              status: "arrived_destination",
              notes: "Cash payment recorded. Package is paid and waiting for customer signature.",
              created_by: auth.userId,
            });
          }

          return apiJson({ ok: true, payment: data }, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
