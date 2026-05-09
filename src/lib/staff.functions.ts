import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAudit } from "@/server/audit";

const ROLES = ["admin", "staff", "china_staff", "kenya_staff", "client"] as const;

async function requireAdmin(headers?: Headers) {
  const authHeader = headers?.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const { data: userRes, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userRes.user) throw new Error("Unauthorized");
  const { data: roles } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userRes.user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  if (!isAdmin) throw new Error("Admin role required");
  return { actorId: userRes.user.id, actorEmail: userRes.user.email ?? null };
}

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .handler(async ({ signal: _s }) => {
    const headers = (globalThis as any).__lovableLastHeaders as Headers | undefined;
    await requireAdmin(headers);
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const ids = users.users.map((u) => u.id);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids);
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, display_name, phone, preferred_language, location" as any).in("id", ids);
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role as string);
      roleMap.set(r.user_id, arr);
    });
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return users.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      roles: roleMap.get(u.id) ?? [],
      profile: profMap.get(u.id) ?? null,
    }));
  });

export const setUserRoles = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      roles: z.array(z.enum(ROLES)).min(1),
      location: z.enum(["china", "kenya"]).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const headers = (globalThis as any).__lovableLastHeaders as Headers | undefined;
    const actor = await requireAdmin(headers);

    // Replace roles
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const rows = data.roles.map((role) => ({ user_id: data.userId, role: role as any }));
    const { error: insErr } = await supabaseAdmin.from("user_roles").insert(rows);
    if (insErr) throw insErr;

    if (data.location !== undefined) {
      await (supabaseAdmin.from("profiles") as any)
        .update({ location: data.location })
        .eq("id", data.userId);
    }

    await logAudit({
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      action: "user_roles.update",
      resourceType: "user",
      resourceId: data.userId,
      metadata: { roles: data.roles, location: data.location ?? null },
    });

    return { ok: true };
  });