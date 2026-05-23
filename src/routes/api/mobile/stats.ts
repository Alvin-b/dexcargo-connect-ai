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

          const [
            clients,
            packages,
            pending,
            receivedChina,
            inTransit,
            arrivedDestination,
            outForDelivery,
            cleared,
            delivered,
            loadingBatches,
            packageBreakdown,
            payments,
            paymentsToday,
            marketing,
            conversations,
          ] = await Promise.all([
            supabaseAdmin.from("clients").select("id", { count: "exact", head: true }),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }).eq("status", "pending"),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }).eq("status", "received_in_china"),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }).eq("status", "in_transit"),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }).eq("status", "arrived_destination"),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }).eq("status", "out_for_delivery"),
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).eq("status", "cleared"),
            supabaseAdmin.from("packages").select("id", { count: "exact", head: true }).eq("status", "delivered"),
            supabaseAdmin.from("loading_batches").select("left_behind_total").gte("created_at", sinceIso),
            (supabaseAdmin.from("packages") as any).select("mode, cargo_type, special_cargo_type, weight_kg, cbm, shipping_cost, total_charge").gte("created_at", sinceIso),
            supabaseAdmin.from("payments").select("amount, status, created_at").gte("created_at", sinceIso),
            supabaseAdmin.from("payments").select("amount, status").gte("created_at", todayStart.toISOString()),
            supabaseAdmin.from("marketing_posts").select("id, status", { count: "exact" }),
            supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }),
          ]);

          const sumSuccess = (rows: any[] | null) => (rows ?? []).filter((r) => r.status === "success").reduce((s, r) => s + Number(r.amount ?? 0), 0);
          const leftBehind = (loadingBatches.data ?? []).reduce((sum: number, row: any) => sum + Number(row.left_behind_total ?? 0), 0);
          const breakdown = (packageBreakdown.data ?? []).reduce((acc: any, row: any) => {
            const mode = row.mode ?? "unknown";
            const cargoType = row.cargo_type ?? "general";
            acc.by_mode[mode] = (acc.by_mode[mode] ?? 0) + 1;
            acc.by_cargo_type[cargoType] = (acc.by_cargo_type[cargoType] ?? 0) + 1;
            if (row.special_cargo_type) acc.by_special_cargo_type[row.special_cargo_type] = (acc.by_special_cargo_type[row.special_cargo_type] ?? 0) + 1;
            acc.total_weight_kg += Number(row.weight_kg ?? 0);
            acc.total_cbm += Number(row.cbm ?? 0);
            acc.total_charges += Number(row.total_charge ?? row.shipping_cost ?? 0);
            return acc;
          }, { by_mode: {}, by_cargo_type: {}, by_special_cargo_type: {}, total_weight_kg: 0, total_cbm: 0, total_charges: 0 });

          return apiJson({
            clients: clients.count ?? 0,
            packages: {
              total: packages.count ?? 0,
              pending: pending.count ?? 0,
              received_in_china: receivedChina.count ?? 0,
              pending_loading: receivedChina.count ?? 0,
              in_transit: inTransit.count ?? 0,
              arrived_destination: arrivedDestination.count ?? 0,
              out_for_delivery: outForDelivery.count ?? 0,
              cleared: cleared.count ?? 0,
              pending_clearance: arrivedDestination.count ?? 0,
              delivered: delivered.count ?? 0,
              left_behind: leftBehind,
              breakdown,
            },
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
