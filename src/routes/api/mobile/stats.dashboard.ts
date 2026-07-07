import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

// GET /api/mobile/stats/dashboard — Kenya warehouse KPIs.
export const Route = createFileRoute("/api/mobile/stats/dashboard")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const todayStart = new Date(); todayStart.setHours(0,0,0,0);
          const todayIso = todayStart.toISOString();
          const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);

          const [receivedToday, awaitingPayment, readyForCollection, clearedToday, revenueToday, revenue30d, activeEmployees, recent] = await Promise.all([
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).gte("received_at", todayIso),
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).eq("payment_status", "pending").in("status", ["arrived_destination","awaiting_payment"]),
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).eq("payment_status", "paid").in("status", ["paid","ready_for_collection","arrived_destination"]),
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).in("status", ["released","cleared"]).gte("released_at", todayIso),
            supabaseAdmin.from("payments").select("amount, status").eq("status", "success").gte("created_at", todayIso),
            supabaseAdmin.from("payments").select("amount, status, created_at").eq("status", "success").gte("created_at", monthAgo.toISOString()),
            (supabaseAdmin.from("employees") as any).select("id", { count: "exact", head: true }).eq("status", "active"),
            supabaseAdmin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(20),
          ]);
          const sum = (rows: any[] | null | undefined) => (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
          const trend: Record<string, number> = {};
          for (const r of revenue30d.data ?? []) {
            const day = String(r.created_at).slice(0, 10);
            trend[day] = (trend[day] ?? 0) + Number(r.amount ?? 0);
          }
          return apiJson({
            today: {
              received: receivedToday.count ?? 0,
              awaiting_payment: awaitingPayment.count ?? 0,
              ready_for_collection: readyForCollection.count ?? 0,
              cleared: clearedToday.count ?? 0,
              revenue_kes: sum(revenueToday.data),
            },
            active_employees: activeEmployees.count ?? 0,
            revenue_30d_kes: sum(revenue30d.data),
            revenue_trend_30d: trend,
            recent_activity: recent.data ?? [],
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});