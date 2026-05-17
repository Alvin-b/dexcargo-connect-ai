import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticate,
  apiJson,
  preflight,
  readJson,
  badRequest,
  serverError,
} from "@/server/api-auth";

const STAFF_ROLES = new Set(["admin", "staff", "china_staff", "kenya_staff"]);
const STAFF_LOCATIONS = new Set(["china", "kenya", "admin"]);
const LOCATION_ROLES = ["admin", "staff", "china_staff", "kenya_staff"];

function roleForLocation(location: string) {
  if (location === "admin") return "admin";
  if (location === "kenya") return "kenya_staff";
  return "china_staff";
}

function locationForStaff(userRoles: string[], profileLocation?: string | null) {
  if (userRoles.includes("admin")) return "admin";
  if (userRoles.includes("kenya_staff")) return "kenya";
  if (userRoles.includes("china_staff")) return "china";
  return profileLocation ?? "china";
}

async function replaceStaffRoles(userId: string, location: string) {
  const nextRoles = location === "admin" ? ["admin", "staff"] : ["staff", roleForLocation(location)];

  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).in("role", LOCATION_ROLES as any);

  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert(nextRoles.map((role) => ({ user_id: userId, role: role as any })));
  if (error) throw error;
}

export const Route = createFileRoute("/api/mobile/staff")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;

          const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
          if (error) throw error;
          const ids = list.users.map((user) => user.id);
          const { data: roles } = await supabaseAdmin
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", ids);
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("id, display_name, phone, staff_location, is_active")
            .in("id", ids);

          const roleMap = new Map<string, string[]>();
          (roles ?? []).forEach((row: any) => {
            const current = roleMap.get(row.user_id) ?? [];
            current.push(row.role);
            roleMap.set(row.user_id, current);
          });
          const profileMap = new Map<string, any>(
            (profiles ?? []).map((profile: any) => [profile.id, profile]),
          );
          const data = list.users.flatMap((user) => {
            const userRoles = roleMap.get(user.id) ?? [];
            if (!userRoles.some((role) => STAFF_ROLES.has(role))) return [];
            const profile = profileMap.get(user.id) ?? {};
            return [
              {
                id: user.id,
                email: user.email ?? null,
                display_name: profile.display_name ?? user.email ?? "Staff member",
                phone: profile.phone ?? null,
                staff_location: locationForStaff(userRoles, profile.staff_location),
                is_active: profile.is_active !== false,
                roles: userRoles,
              },
            ];
          });
          return apiJson({ data });
        } catch (e) {
          return serverError(e);
        }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.email || !body?.password || !body?.name)
            return badRequest("name, email and password required");
          if (String(body.password).length < 6)
            return badRequest("password must be at least 6 characters");
          const location = String(body.location ?? "china").toLowerCase();
          if (!STAFF_LOCATIONS.has(location))
            return badRequest("location must be china, kenya or admin");

          const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
            user_metadata: { display_name: body.name },
          });
          if (error) throw error;
          const userId = created.user.id;

          await supabaseAdmin.from("profiles").upsert({
            id: userId,
            display_name: body.name,
            phone: body.phone ?? null,
            staff_location: location === "admin" ? null : location,
            is_active: true,
          });
          await replaceStaffRoles(userId, location);
          return apiJson({ ok: true, id: userId }, 201);
        } catch (e) {
          return serverError(e);
        }
      },
      PATCH: async ({ request }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.id) return badRequest("id required");
          const patch: any = {};
          if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
          if (body.location) {
            const location = String(body.location).toLowerCase();
            if (!STAFF_LOCATIONS.has(location))
              return badRequest("location must be china, kenya or admin");
            patch.staff_location = location === "admin" ? null : location;
          }
          if (body.name) patch.display_name = body.name;
          if (body.phone !== undefined) patch.phone = body.phone;
          const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", body.id);
          if (error) throw error;
          if (body.location) await replaceStaffRoles(body.id, String(body.location).toLowerCase());
          return apiJson({ ok: true });
        } catch (e) {
          return serverError(e);
        }
      },
      DELETE: async ({ request }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const id = new URL(request.url).searchParams.get("id");
          if (!id) return badRequest("id required");
          if (id === auth.userId) return badRequest("admin cannot disable own account");
          await supabaseAdmin.from("profiles").update({ is_active: false }).eq("id", id);
          return apiJson({ ok: true });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
