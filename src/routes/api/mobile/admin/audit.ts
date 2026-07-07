import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

// GET /api/mobile/admin/audit?actor_id=&resource_type=&resource_id=&action=&since=&until=&limit=
export const Route = createFileRoute("/api/mobile/admin/audit")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
          let q = supabaseAdmin.from("audit_logs").select("*", { count: "exact" })
            .order("created_at", { ascending: false }).limit(limit);
          const actor = url.searchParams.get("actor_id");
          const employeeId = url.searchParams.get("employee_id");
          if (employeeId) {
            const { data: emp } = await (supabaseAdmin.from("employees") as any).select("user_id").eq("id", employeeId).maybeSingle();
            if (emp?.user_id) q = q.eq("actor_id", emp.user_id);
          } else if (actor) q = q.eq("actor_id", actor);
          const rt = url.searchParams.get("resource_type"); if (rt) q = q.eq("resource_type", rt);
          const rid = url.searchParams.get("resource_id"); if (rid) q = q.eq("resource_id", rid);
          const action = url.searchParams.get("action"); if (action) q = q.ilike("action", `%${action}%`);
          const since = url.searchParams.get("since"); if (since) q = q.gte("created_at", since);
          const until = url.searchParams.get("until"); if (until) q = q.lte("created_at", until);
          const { data, count, error } = await q;
          if (error) throw error;
          return apiJson({ data, count });
        } catch (e) { return serverError(e); }
      },
    },
  },
});