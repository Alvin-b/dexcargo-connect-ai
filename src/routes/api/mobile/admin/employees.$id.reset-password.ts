import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { logAudit } from "@/server/audit";

// POST /api/mobile/admin/employees/:id/reset-password  { new_password }
// Admin sets a new password for the employee directly (no email loop needed).
export const Route = createFileRoute("/api/mobile/admin/employees/$id/reset-password")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.new_password || String(body.new_password).length < 8) return badRequest("new_password required (min 8 chars)");
          const { data: emp } = await (supabaseAdmin.from("employees") as any)
            .select("user_id, employee_code").eq("id", params.id).maybeSingle();
          if (!emp) return notFound("employee not found");
          const { error } = await supabaseAdmin.auth.admin.updateUserById(emp.user_id, { password: String(body.new_password) });
          if (error) return badRequest(error.message);
          await logAudit({
            actorId: auth.userId,
            action: "employee.password_reset",
            resourceType: "employee",
            resourceId: String(params.id),
            metadata: { employee_code: emp.employee_code },
            request,
          });
          return apiJson({ ok: true });
        } catch (e) { return serverError(e); }
      },
    },
  },
});