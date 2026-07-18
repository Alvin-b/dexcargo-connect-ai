import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";
import { logAudit } from "@/server/audit";

// GET  /api/mobile/admin/employees          → list all employees (staff visible)
// POST /api/mobile/admin/employees          → admin registers a new employee
//   body: { full_name, email, password, phone?, role, branch_id?, notes? }
export const Route = createFileRoute("/api/mobile/admin/employees")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const status = url.searchParams.get("status");
          const role = url.searchParams.get("role");
          const q = url.searchParams.get("q");
          let query = (supabaseAdmin.from("employees") as any)
            .select("*, branch:warehouses(id, name, city)")
            .order("employee_code", { ascending: true });
          if (status) query = query.eq("status", status);
          if (role) query = query.eq("role", role);
          if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,employee_code.ilike.%${q}%,phone.ilike.%${q}%`);
          const { data, error } = await query;
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.full_name) return badRequest("full_name required");
          if (!body?.email) return badRequest("email required");
          if (!body?.password || String(body.password).length < 8) return badRequest("password required (min 8 chars)");
          const role = String(body.role ?? "sales_rep") as "admin" | "sales_rep" | "sales_manager" | "logistics_manager";
          if (!["admin","sales_rep","sales_manager","logistics_manager"].includes(role)) return badRequest("invalid role");

          // 1) create auth user
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: String(body.email).trim().toLowerCase(),
            password: String(body.password),
            email_confirm: true,
            phone: body.phone ? String(body.phone) : undefined,
            user_metadata: { display_name: body.full_name },
          });
          if (createErr || !created.user) return badRequest(createErr?.message ?? "failed to create auth user");

          // 2) register employee row + role via SECURITY DEFINER helper
          const { data: emp, error: empErr } = await (supabaseAdmin as any).rpc("admin_register_employee", {
            _user_id: created.user.id,
            _full_name: body.full_name,
            _email: body.email,
            _phone: body.phone ?? null,
            _role: role,
            _branch_id: body.branch_id ?? null,
            _notes: body.notes ?? null,
          });
          if (empErr) {
            // rollback: delete the auth user we just created
            await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
            throw empErr;
          }

          await logAudit({
            actorId: auth.userId,
            action: "employee.registered",
            resourceType: "employee",
            resourceId: (emp as any)?.id ?? null,
            metadata: { email: body.email, role, branch_id: body.branch_id ?? null },
            request,
          });

          return apiJson({ ok: true, employee: emp }, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
