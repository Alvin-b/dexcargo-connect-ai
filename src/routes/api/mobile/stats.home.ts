import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";
import { getEmployeeByUserId } from "@/server/employees";

// GET /api/mobile/stats/home
// Returns a role-scoped dashboard payload for the mobile home screens:
//   sales_rep         -> my packages by status + my commission balance
//   logistics_manager -> warehouse-wide package pipeline + occupancy
//   sales_manager     -> team pipeline + top performers
//   admin             -> system-wide totals + revenue trend
export const Route = createFileRoute("/api/mobile/stats/home")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const emp = await getEmployeeByUserId(auth.userId);
          const role = auth.isAdmin ? "admin" : (emp?.role ?? "staff");
          const todayIso = new Date(new Date().setHours(0,0,0,0)).toISOString();

          const countPkg = async (filter: (q: any) => any) => {
            const { count } = await filter((supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }));
            return count ?? 0;
          };

          if (role === "sales_rep" || (!auth.isAdmin && role === "staff" && emp)) {
            const empId = emp!.id;
            const [registered, paid, ready, delivered, recent, commissions] = await Promise.all([
              countPkg((q) => q.eq("sales_rep_employee_id", empId).in("status", ["registered","received","arrived","verified"])),
              countPkg((q) => q.eq("sales_rep_employee_id", empId).eq("status", "paid")),
              countPkg((q) => q.eq("sales_rep_employee_id", empId).in("status", ["ready_for_collection","awaiting_pickup","reserved"])),
              countPkg((q) => q.eq("sales_rep_employee_id", empId).in("status", ["collected","picked_up","cleared"])),
              (supabaseAdmin.from("packages") as any)
                .select("id, tracking_number, status, description, customers(full_name, phone), received_at")
                .eq("sales_rep_employee_id", empId).order("received_at", { ascending: false }).limit(6),
              (supabaseAdmin.from("commissions") as any)
                .select("amount, status").eq("employee_id", empId),
            ]);
            const commSummary = { pending: 0, approved: 0, paid: 0, total: 0 };
            for (const c of commissions.data ?? []) {
              const a = Number(c.amount ?? 0); commSummary.total += a;
              if (c.status === "pending") commSummary.pending += a;
              else if (c.status === "approved") commSummary.approved += a;
              else if (c.status === "paid") commSummary.paid += a;
            }
            return apiJson({
              role: "sales_rep",
              stats: { registered, paid, ready_or_uncollected: ready, delivered },
              recent_packages: recent.data ?? [],
              commissions: commSummary,
            });
          }

          if (role === "logistics_manager") {
            const [total, unpaid, ready, cleared, shelves] = await Promise.all([
              countPkg((q) => q),
              countPkg((q) => q.in("status", ["awaiting_payment","registered","received","arrived","verified"])),
              countPkg((q) => q.in("status", ["ready_for_collection","awaiting_pickup","reserved"])),
              countPkg((q) => q.in("status", ["collected","picked_up","cleared"]).gte("collected_at", todayIso)),
              (supabaseAdmin.from("warehouse_shelves") as any).select("id, code, section, capacity").limit(20),
            ]);
            return apiJson({
              role: "logistics_manager",
              stats: { total_managed: total, unpaid_in_bond: unpaid, ready_for_collection: ready, cleared_today: cleared },
              shelves: shelves.data ?? [],
            });
          }

          if (role === "sales_manager") {
            let teamQ: any = (supabaseAdmin.from("employees") as any).select("id, full_name, employee_code, role").eq("status", "active");
            if (emp?.branch_id) teamQ = teamQ.eq("branch_id", emp.branch_id);
            else teamQ = teamQ.in("role", ["sales_rep"]);
            const { data: team } = await teamQ;
            const ids = (team ?? []).map((t: any) => t.id);
            const [teamPkgs, teamComm] = await Promise.all([
              ids.length ? (supabaseAdmin.from("packages") as any).select("sales_rep_employee_id, status").in("sales_rep_employee_id", ids) : { data: [] },
              ids.length ? (supabaseAdmin.from("commissions") as any).select("employee_id, amount, status").in("employee_id", ids) : { data: [] },
            ]);
            const perRep: Record<string, { packages: number; delivered: number; commission_pending: number }> = {};
            for (const t of team ?? []) perRep[t.id] = { packages: 0, delivered: 0, commission_pending: 0 };
            for (const p of (teamPkgs as any).data ?? []) {
              const r = perRep[p.sales_rep_employee_id]; if (!r) continue;
              r.packages += 1;
              if (["collected","picked_up","cleared"].includes(p.status)) r.delivered += 1;
            }
            for (const c of (teamComm as any).data ?? []) {
              const r = perRep[c.employee_id]; if (!r) continue;
              if (c.status === "pending" || c.status === "approved") r.commission_pending += Number(c.amount ?? 0);
            }
            const leaderboard = (team ?? []).map((t: any) => ({ ...t, ...perRep[t.id] }))
              .sort((a: any, b: any) => b.delivered - a.delivered);
            const totals = leaderboard.reduce((acc: any, r: any) => ({
              packages: acc.packages + r.packages, delivered: acc.delivered + r.delivered,
              commission_pending: acc.commission_pending + r.commission_pending,
            }), { packages: 0, delivered: 0, commission_pending: 0 });
            return apiJson({ role: "sales_manager", team_size: (team ?? []).length, totals, leaderboard });
          }

          // admin: system-wide
          const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
          const [pkgs, awaiting, ready, activeEmps, revenue30d, revenueToday] = await Promise.all([
            countPkg((q) => q),
            countPkg((q) => q.eq("status", "awaiting_payment")),
            countPkg((q) => q.in("status", ["ready_for_collection","awaiting_pickup"])),
            (supabaseAdmin.from("employees") as any).select("id", { count: "exact", head: true }).eq("status", "active"),
            (supabaseAdmin.from("payments") as any).select("amount, created_at").eq("status", "success").gte("created_at", monthAgo.toISOString()),
            (supabaseAdmin.from("payments") as any).select("amount").eq("status", "success").gte("created_at", todayIso),
          ]);
          const trend: Record<string, number> = {};
          for (const r of revenue30d.data ?? []) {
            const d = String(r.created_at).slice(0, 10);
            trend[d] = (trend[d] ?? 0) + Number(r.amount ?? 0);
          }
          const sum = (rows: any[] | null | undefined) => (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
          return apiJson({
            role: "admin",
            stats: {
              total_packages: pkgs, awaiting_payment: awaiting, ready_for_collection: ready,
              active_employees: activeEmps.count ?? 0,
              revenue_today_kes: sum(revenueToday.data), revenue_30d_kes: sum(revenue30d.data),
            },
            revenue_trend_30d: trend,
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});