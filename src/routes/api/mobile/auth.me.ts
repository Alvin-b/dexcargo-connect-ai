import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/auth/me")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data: profile } = await (supabaseAdmin.from("profiles") as any)
            .select("id, display_name, phone, language_preference, staff_location, is_active")
            .eq("id", auth.userId)
            .maybeSingle();
          const { data: roles } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", auth.userId);
          return apiJson({
            user_id: auth.userId,
            profile,
            roles: (roles ?? []).map((r) => r.role),
            is_admin: auth.isAdmin,
            staff_location: auth.staffLocation,
          });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
