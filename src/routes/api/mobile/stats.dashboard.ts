import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/stats/dashboard")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const todayIso = new Date(new Date().setHours(0,0,0,0)).toISOString();
          const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
          const [receivedToday, awaitingPayment, ready, clearedToday, revenueToday, revenue30d, activeEmps] = await Promise.all([
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).gte("received_at", todayIso),
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).eq("status", "awaiting_payment"),
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).eq("status", "ready_for_collection"),
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).in("status", ["collected","cleared"]).gte("collected_at", todayIso),
            (supabaseAdmin.from("payments") as any).select("amount, status").eq("status", "success").gte("created_at", todayIso),
            (supabaseAdmin.from("payments") as any).select("amount, status, created_at").eq("status", "success").gte("created_at", monthAgo.toISOString()),
            (supabaseAdmin.from("employees") as any).select("id", { count: "exact", head: true }).eq("status", "active"),
          ]);
          const sum = (rows: any[] | null | undefined) => (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
          const trend: Record<string, number> = {};
          for (const r of revenue30d.data ?? []) {
            const d = String(r.created_at).slice(0, 10);
            trend[d] = (trend[d] ?? 0) + Number(r.amount ?? 0);
          }
          return apiJson({
            today: {
              received: receivedToday.count ?? 0,
              awaiting_payment: awaitingPayment.count ?? 0,
              ready_for_collection: ready.count ?? 0,
              cleared: clearedToday.count ?? 0,
              revenue_kes: sum(revenueToday.data),
            },
            active_employees: activeEmps.count ?? 0,
            revenue_30d_kes: sum(revenue30d.data),
            revenue_trend_30d: trend,
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});