import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { logAudit } from "@/server/audit";

// PATCH /api/mobile/commissions/:id  { action: "approve" | "mark_paid" | "void", notes? }
// Admin only. Sales manager may approve commissions of team members (approve/void).
export const Route = createFileRoute("/api/mobile/commissions/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data, error } = await (supabaseAdmin.from("commissions") as any)
            .select("*, employees(full_name, employee_code), packages(tracking_number)")
            .eq("id", params.id).maybeSingle();
          if (error) throw error;
          if (!data) return notFound();
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
      PATCH: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const action = body?.action;
          if (!action) return badRequest("action required");
          const patch: any = { notes: body?.notes ?? null };
          if (action === "approve") { patch.status = "approved"; patch.approved_at = new Date().toISOString(); patch.approved_by = auth.userId; }
          else if (action === "mark_paid") { patch.status = "paid"; }
          else if (action === "void") { patch.status = "void"; }
          else return badRequest("invalid action");
          const { data, error } = await (supabaseAdmin.from("commissions") as any).update(patch).eq("id", params.id).select().single();
          if (error) throw error;
          await logAudit({ actorId: auth.userId, action: `commission.${action}`, resourceType: "commission", resourceId: params.id, request });
          return apiJson({ ok: true, commission: data });
        } catch (e) { return serverError(e); }
      },
    },
  },
});