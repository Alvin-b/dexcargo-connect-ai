import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

// GET  /api/mobile/notifications?audience=sales_rep&unread=1
// POST /api/mobile/notifications/mark-read  { ids: [uuid, ...] }  (use ?action=mark-read)
export const Route = createFileRoute("/api/mobile/notifications")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const audience = url.searchParams.get("audience"); // all|admin|sales_manager|logistics_manager|sales_rep
          const unread = url.searchParams.get("unread") === "1";
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);

          let q = supabaseAdmin.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
          if (audience) q = q.in("audience", [audience, "all"]);
          const { data, error } = await q;
          if (error) throw error;

          // Per-user reads
          const ids = (data ?? []).map((n) => n.id);
          let readSet = new Set<string>();
          if (ids.length) {
            const { data: reads } = await supabaseAdmin.from("notification_reads")
              .select("notification_id").eq("user_id", auth.userId).in("notification_id", ids);
            readSet = new Set((reads ?? []).map((r: any) => r.notification_id));
          }
          const enriched = (data ?? []).map((n) => ({ ...n, read: readSet.has(n.id) }));
          const result = unread ? enriched.filter((n) => !n.read) : enriched;
          return apiJson({ data: result, unread_count: enriched.filter((n) => !n.read).length });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (body?.action === "broadcast") {
            const adminAuth = await authenticate(request, { requireAdmin: true });
            if (!adminAuth.ok) return adminAuth.response;
            const title = String(body.title ?? "DEXCARGO Broadcast").trim();
            const message = String(body.message ?? body.body ?? "").trim();
            const audience = String(body.audience ?? "all").trim();
            if (!message) return badRequest("message required");
            if (!["all", "admin", "sales_rep", "sales_manager", "logistics_manager"].includes(audience)) {
              return badRequest("invalid audience");
            }
            const { data, error } = await (supabaseAdmin.from("notifications") as any)
              .insert({
                title,
                body: message,
                audience,
                type: body.type ?? "broadcast",
                severity: body.severity ?? "info",
                data: body.data ?? null,
              })
              .select("*")
              .single();
            if (error) throw error;
            return apiJson({ ok: true, notification: data }, 201);
          }
          if (!Array.isArray(body?.ids) || body.ids.length === 0) return badRequest("ids[] required");
          const rows = body.ids.map((id: string) => ({ notification_id: id, user_id: auth.userId }));
          if (body.action === "resolve") {
            const { error: resolveError } = await (supabaseAdmin.from("notifications") as any)
              .update({
                resolved_at: new Date().toISOString(),
                resolved_by: auth.userId,
                resolution_notes: body.notes ?? null,
              })
              .in("id", body.ids);
            if (resolveError) throw resolveError;
          }
          const { error } = await supabaseAdmin.from("notification_reads").upsert(rows, { onConflict: "notification_id,user_id" });
          if (error) throw error;
          return apiJson({ ok: true, marked: rows.length, resolved: body.action === "resolve" ? rows.length : 0 });
        } catch (e) { return serverError(e); }
      },
    },
  },
});
