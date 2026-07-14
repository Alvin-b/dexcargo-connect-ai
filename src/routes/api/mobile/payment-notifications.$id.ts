import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, notFound, serverError } from "@/server/api-auth";

// GET /api/mobile/payment-notifications/:id  — includes allocations + linked packages
export const Route = createFileRoute("/api/mobile/payment-notifications/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data: notif, error } = await (supabaseAdmin.from("payment_notifications") as any)
            .select("*")
            .eq("id", params.id)
            .maybeSingle();
          if (error) throw error;
          if (!notif) return notFound("payment notification not found");

          const { data: allocs } = await (supabaseAdmin.from("payment_notification_allocations") as any)
            .select("*, packages(id, tracking_number, status, customer_id, customers(full_name, phone))")
            .eq("payment_notification_id", params.id)
            .order("linked_at", { ascending: false });

          return apiJson({ notification: notif, allocations: allocs ?? [] });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
