import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

// GET  /api/mobile/notifications?audience=china&unread=1
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
          const audience = url.searchParams.get("audience"); // china|kenya|all
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
