import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/stats")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const since = new Date(); since.setDate(since.getDate() - 30);
          const sinceIso = since.toISOString();
          const todayStart = new Date(); todayStart.setHours(0,0,0,0);

          const [clients, packages, inTransit, delivered, pending, payments, paymentsToday, marketing, conversations] = await Promise.all([
            supabaseAdmin.from("clients").select("id", { count: "exact", head: true }),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }).eq("status", "in_transit"),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }).eq("status", "delivered"),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }).eq("status", "pending"),
            supabaseAdmin.from("payments").select("amount, status, created_at").gte("created_at", sinceIso),
            supabaseAdmin.from("payments").select("amount, status").gte("created_at", todayStart.toISOString()),
            supabaseAdmin.from("marketing_posts").select("id, status", { count: "exact" }),
            supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }),
          ]);

          const sumSuccess = (rows: any[] | null) => (rows ?? []).filter((r) => r.status === "success").reduce((s, r) => s + Number(r.amount ?? 0), 0);

          return apiJson({
            clients: clients.count ?? 0,
            packages: { total: packages.count ?? 0, in_transit: inTransit.count ?? 0, delivered: delivered.count ?? 0, pending: pending.count ?? 0 },
            payments: {
              revenue_30d: sumSuccess(payments.data),
              revenue_today: sumSuccess(paymentsToday.data),
              count_30d: payments.data?.length ?? 0,
            },
            marketing: { total: marketing.count ?? 0 },
            conversations: conversations.count ?? 0,
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});