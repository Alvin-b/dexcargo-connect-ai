import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";
import { getEmployeeByUserId } from "@/server/employees";

// GET /api/mobile/commissions?scope=me|team|all&status=&from=&to=
// - Sales rep: forced to scope=me
// - Sales manager: may query scope=team (their direct reports) or me
// - Admin: any scope
// Returns { data, summary: { pending, approved, paid, total } }
export const Route = createFileRoute("/api/mobile/commissions")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const emp = await getEmployeeByUserId(auth.userId);
          const url = new URL(request.url);
          const requested = (url.searchParams.get("scope") ?? "me").toLowerCase();
          const status = url.searchParams.get("status");
          const from = url.searchParams.get("from");
          const to = url.searchParams.get("to");
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
          const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

          // Determine effective scope by role
          const role = emp?.role ?? (auth.isAdmin ? "admin" : "staff");
          let scope: "me" | "team" | "all" = "me";
          if (auth.isAdmin) scope = (requested as any) || "all";
          else if (role === "sales_manager" || role === "logistics_manager") scope = requested === "me" ? "me" : "team";
          else scope = "me";

          let empIds: string[] | null = null;
          if (scope === "me") {
            if (!emp) return apiJson({ data: [], summary: emptySummary(), scope });
            empIds = [emp.id];
          } else if (scope === "team") {
            if (!emp) return apiJson({ data: [], summary: emptySummary(), scope });
            // Team = employees whose sales_manager or direct manager is this employee, or same branch
            const { data: team } = await (supabaseAdmin.from("employees") as any)
              .select("id").or(`manager_id.eq.${emp.id},branch_id.eq.${emp.branch_id ?? "00000000-0000-0000-0000-000000000000"}`);
            empIds = [emp.id, ...((team ?? []).map((t: any) => t.id))];
          }

          let q: any = (supabaseAdmin.from("commissions") as any)
            .select("*, employees(full_name, employee_code, role), packages(tracking_number, description)", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
          if (empIds) q = q.in("employee_id", empIds);
          if (status) q = q.eq("status", status);
          if (from) q = q.gte("created_at", from);
          if (to) q = q.lte("created_at", to);
          const { data, count, error } = await q;
          if (error) throw error;

          // Summary aggregation across full match (unbounded by limit)
          let sumQ: any = (supabaseAdmin.from("commissions") as any).select("amount, status");
          if (empIds) sumQ = sumQ.in("employee_id", empIds);
          if (from) sumQ = sumQ.gte("created_at", from);
          if (to) sumQ = sumQ.lte("created_at", to);
          const { data: sumRows } = await sumQ;
          const summary = emptySummary();
          for (const r of sumRows ?? []) {
            const amt = Number(r.amount ?? 0);
            summary.total += amt;
            if (r.status === "pending") summary.pending += amt;
            else if (r.status === "approved") summary.approved += amt;
            else if (r.status === "paid") summary.paid += amt;
          }

          return apiJson({ data, count, limit, offset, scope, summary });
        } catch (e) { return serverError(e); }
      },
    },
  },
});

function emptySummary() { return { pending: 0, approved: 0, paid: 0, total: 0 }; }