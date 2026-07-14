import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

// GET /api/mobile/payment-notifications/audit?limit=&offset=&package_id=&tracking_number=
// Full history of linked payment notifications with allocations.
export const Route = createFileRoute("/api/mobile/payment-notifications/audit")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
          const pkgId = url.searchParams.get("package_id");
          const tracking = url.searchParams.get("tracking_number");

          if (pkgId || tracking) {
            let aq: any = (supabaseAdmin.from("payment_notification_allocations") as any)
              .select("*, payment_notifications(*)", { count: "exact" })
              .order("linked_at", { ascending: false })
              .range(offset, offset + limit - 1);
            if (pkgId) aq = aq.eq("package_id", pkgId);
            if (tracking) aq = aq.eq("tracking_number", tracking);
            const { data, error, count } = await aq;
            if (error) throw error;
            return apiJson({ items: data ?? [], total: count ?? 0, limit, offset });
          }

          const { data, error, count } = await (supabaseAdmin.from("payment_notifications") as any)
            .select("*, payment_notification_allocations(*, packages(id, tracking_number, status, customers(full_name, phone)))", { count: "exact" })
            .eq("status", "linked")
            .order("linked_at", { ascending: false })
            .range(offset, offset + limit - 1);
          if (error) throw error;
          return apiJson({ items: data ?? [], total: count ?? 0, limit, offset });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
