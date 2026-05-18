import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

function permissionsFor(auth: Extract<Awaited<ReturnType<typeof authenticate>>, { ok: true }>, roles: string[]) {
  if (auth.isAdmin || roles.includes("admin")) {
    return [
      "packages:read",
      "packages:write",
      "packages:receive",
      "packages:load",
      "packages:arrive",
      "packages:clear",
      "packages:deliver",
      "payments:manage",
      "batches:manage",
      "alerts:read",
      "users:manage",
      "analytics:read",
      "settings:manage",
    ];
  }

  if (auth.staffLocation === "kenya" || roles.includes("kenya_staff")) {
    return [
      "packages:read",
      "packages:arrive",
      "packages:clear",
      "packages:deliver",
      "payments:manage",
      "alerts:read",
      "analytics:read",
    ];
  }

  return [
    "packages:read",
    "packages:write",
    "packages:receive",
    "packages:load",
    "batches:manage",
    "alerts:read",
    "analytics:read",
  ];
}

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
            preferred_language: profile?.language_preference ?? "en",
            permissions: permissionsFor(auth, (roles ?? []).map((r) => r.role)),
          });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
