import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

// GET /api/mobile/analytics?days=30
// Operational metrics: loading performance, left-behind, payments, irregular arrivals.
export const Route = createFileRoute("/api/mobile/analytics")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 365);
          const since = new Date(Date.now() - days * 86400_000).toISOString();

          const [batches, payments, irregular, leftBehindNotifs, byStatus, byMode] = await Promise.all([
            supabaseAdmin.from("loading_batches")
              .select("id, batch_code, status, expected_total, loaded_total, left_behind_total, loading_date, closed_at, created_at")
              .gte("created_at", since).order("created_at", { ascending: false }),
            supabaseAdmin.from("payments").select("amount, status, created_at").gte("created_at", since),
            supabaseAdmin.from("notifications").select("id, created_at, package_id")
              .eq("type", "irregular_arrival").gte("created_at", since),
            supabaseAdmin.from("notifications").select("id, data, created_at, batch_id")
              .eq("type", "left_behind").gte("created_at", since),
            supabaseAdmin.from("packages").select("status").gte("created_at", since),
            supabaseAdmin.from("packages").select("mode").gte("created_at", since),
          ]);

          const successPayments = (payments.data ?? []).filter((p: any) => p.status === "success");
          const revenue = successPayments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);

          const totalExpected = (batches.data ?? []).reduce((s: number, b: any) => s + (b.expected_total ?? 0), 0);
          const totalLoaded = (batches.data ?? []).reduce((s: number, b: any) => s + (b.loaded_total ?? 0), 0);
          const totalLeftBehind = (batches.data ?? []).reduce((s: number, b: any) => s + (b.left_behind_total ?? 0), 0);
          const loadRate = totalExpected > 0 ? (totalLoaded / totalExpected) : null;

          const tally = (rows: any[] | null, key: string) => {
            const m: Record<string, number> = {};
            (rows ?? []).forEach((r) => { const k = r[key] ?? "unknown"; m[k] = (m[k] ?? 0) + 1; });
            return m;
          };

          return apiJson({
            window_days: days,
            loading: {
              batches: batches.data?.length ?? 0,
              expected: totalExpected,
              loaded: totalLoaded,
              left_behind: totalLeftBehind,
              load_rate: loadRate,
              recent_batches: (batches.data ?? []).slice(0, 10),
            },
            payments: {
              total_count: payments.data?.length ?? 0,
              success_count: successPayments.length,
              success_rate: payments.data?.length ? successPayments.length / payments.data.length : null,
              revenue,
            },
            irregular_arrivals: {
              count: irregular.data?.length ?? 0,
              recent: irregular.data ?? [],
            },
            left_behind_alerts: {
              count: leftBehindNotifs.data?.length ?? 0,
              recent: leftBehindNotifs.data ?? [],
            },
            packages: {
              by_status: tally(byStatus.data, "status"),
              by_mode: tally(byMode.data, "mode"),
              total_created: byStatus.data?.length ?? 0,
            },
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});