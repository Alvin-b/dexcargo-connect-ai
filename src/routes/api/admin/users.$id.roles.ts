import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdminBearer } from "@/server/admin-auth";
import { apiJson, preflight, badRequest, readJson, serverError } from "@/server/api-auth";
import { logAudit } from "@/server/audit";

const ROLES = new Set(["admin", "staff", "china_staff", "kenya_staff", "client"]);

// POST /api/admin/users/:id/roles  { roles: string[], location?: 'china'|'kenya'|null }
export const Route = createFileRoute("/api/admin/users/$id/roles")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await requireAdminBearer(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<{ roles: string[]; location?: string | null }>(request);
          if (!body || !Array.isArray(body.roles) || body.roles.length === 0)
            return badRequest("roles[] required");
          const invalid = body.roles.filter((r) => !ROLES.has(r));
          if (invalid.length) return badRequest(`invalid roles: ${invalid.join(",")}`);

          await supabaseAdmin.from("user_roles").delete().eq("user_id", params.id);
          const rows = body.roles.map((role) => ({ user_id: params.id, role: role as any }));
          const { error: insErr } = await supabaseAdmin.from("user_roles").insert(rows);
          if (insErr) throw insErr;

          if (body.location !== undefined) {
            await (supabaseAdmin.from("profiles") as any)
              .update({ staff_location: body.location })
              .eq("id", params.id);
          }

          await logAudit({
            actorId: auth.userId,
            actorEmail: auth.email,
            action: "user_roles.update",
            resourceType: "user",
            resourceId: params.id,
            metadata: { roles: body.roles, location: body.location ?? null },
            request,
          });

          return apiJson({ ok: true, roles: body.roles });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
