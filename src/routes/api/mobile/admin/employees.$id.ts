import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { logAudit } from "@/server/audit";

// GET    /api/mobile/admin/employees/:id
// PATCH  /api/mobile/admin/employees/:id   { full_name?, phone?, role?, branch_id?, status?, notes? }
// DELETE /api/mobile/admin/employees/:id   → soft-suspend (never hard delete)
export const Route = createFileRoute("/api/mobile/admin/employees/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data, error } = await (supabaseAdmin.from("employees") as any)
            .select("*, branch:warehouses(id, name, city)")
            .eq("id", params.id).maybeSingle();
          if (error) throw error;
          if (!data) return notFound("employee not found");
          return apiJson({ employee: data });
        } catch (e) { return serverError(e); }
      },
      PATCH: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body) return badRequest("body required");
          const patch: any = {};
          for (const k of ["full_name","phone","branch_id","notes","status","role"]) {
            if (body[k] !== undefined) patch[k] = body[k];
          }
          if (patch.status && !["active","suspended"].includes(patch.status)) return badRequest("invalid status");
          if (patch.role && !["admin","staff","kenya_staff","china_staff"].includes(patch.role)) return badRequest("invalid role");
          if (patch.status === "suspended") { patch.deactivated_by = auth.userId; patch.deactivated_at = new Date().toISOString(); }
          if (patch.status === "active") { patch.deactivated_by = null; patch.deactivated_at = null; }

          const { data, error } = await (supabaseAdmin.from("employees") as any)
            .update(patch).eq("id", params.id).select().single();
          if (error) throw error;

          // Keep user_roles in sync when role changes
          if (patch.role) {
            await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
            await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: patch.role });
          }
          // Deactivate/reactivate the auth user's ability to sign in via profiles.is_active flag
          if (patch.status) {
            await (supabaseAdmin.from("profiles") as any).update({ is_active: patch.status === "active" }).eq("id", data.user_id);
          }

          await logAudit({
            actorId: auth.userId,
            action: `employee.updated${patch.status ? `.${patch.status}` : ""}`,
            resourceType: "employee",
            resourceId: String(params.id),
            metadata: patch,
            request,
          });
          return apiJson({ ok: true, employee: data });
        } catch (e) { return serverError(e); }
      },
      DELETE: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const { data, error } = await (supabaseAdmin.from("employees") as any)
            .update({ status: "suspended", deactivated_by: auth.userId, deactivated_at: new Date().toISOString() })
            .eq("id", params.id).select().single();
          if (error) throw error;
          await (supabaseAdmin.from("profiles") as any).update({ is_active: false }).eq("id", data.user_id);
          await logAudit({
            actorId: auth.userId,
            action: "employee.suspended",
            resourceType: "employee",
            resourceId: String(params.id),
            request,
          });
          return apiJson({ ok: true, employee: data });
        } catch (e) { return serverError(e); }
      },
    },
  },
});