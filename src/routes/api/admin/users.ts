import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdminBearer } from "@/server/admin-auth";
import { apiJson, preflight, serverError } from "@/server/api-auth";

// GET /api/admin/users — list all users + roles + profile
export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await requireAdminBearer(request);
          if (!auth.ok) return auth.response;
          const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
          if (error) throw error;
          const ids = list.users.map((u) => u.id);
          const { data: roles } = await supabaseAdmin
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", ids);
          const { data: profiles } = await (supabaseAdmin.from("profiles") as any)
            .select("id, display_name, phone, language_preference, staff_location, is_active")
            .in("id", ids);
          const roleMap = new Map<string, string[]>();
          (roles ?? []).forEach((r: any) => {
            const arr = roleMap.get(r.user_id) ?? [];
            arr.push(r.role);
            roleMap.set(r.user_id, arr);
          });
          const profMap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
          const users = list.users.map((u) => ({
            id: u.id,
            email: u.email ?? null,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at ?? null,
            roles: roleMap.get(u.id) ?? [],
            profile: profMap.get(u.id) ?? null,
          }));
          return apiJson({ users });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
