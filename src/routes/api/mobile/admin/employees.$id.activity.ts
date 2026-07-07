import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, notFound, serverError } from "@/server/api-auth";

// GET /api/mobile/admin/employees/:id/activity
// Returns aggregated activity + recent audit for one employee.
export const Route = createFileRoute("/api/mobile/admin/employees/$id/activity")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data: emp } = await (supabaseAdmin.from("employees") as any)
            .select("id, user_id, employee_code, full_name, role, status")
            .eq("id", params.id).maybeSingle();
          if (!emp) return notFound("employee not found");

          const [received, released, payments, audits] = await Promise.all([
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).eq("received_by_employee_id", emp.id),
            (supabaseAdmin.from("packages") as any).select("id", { count: "exact", head: true }).eq("released_by_employee_id", emp.id),
            (supabaseAdmin.from("payments") as any).select("id, amount, status", { count: "exact" }).eq("recorded_by_employee_id", emp.id),
            supabaseAdmin.from("audit_logs").select("*").eq("actor_id", emp.user_id).order("created_at", { ascending: false }).limit(50),
          ]);
          const revenue = (payments.data ?? []).filter((p: any) => p.status === "success").reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
          return apiJson({
            employee: emp,
            packages_received: received.count ?? 0,
            packages_released: released.count ?? 0,
            payments_recorded: payments.count ?? 0,
            revenue_collected: revenue,
            recent_activity: audits.data ?? [],
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});