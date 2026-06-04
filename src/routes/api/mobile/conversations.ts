import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";
import { assignUnassignedConversations } from "@/server/conversation-assignment";

export const Route = createFileRoute("/api/mobile/conversations")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          await assignUnassignedConversations();
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          const status = url.searchParams.get("status"); // "unassigned" | "mine" | "all"
          let query = (supabaseAdmin.from("conversations") as any)
            .select("*, clients(id, full_name, whatsapp_number)")
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .limit(limit);
          if (status === "unassigned") query = query.is("assigned_staff_id", null);
          else if (!auth.isAdmin || status === "mine") query = query.eq("assigned_staff_id", auth.userId);
          const { data: convs, error } = await query;
          if (error) throw error;

          // Enrich: latest message preview + latest tracking number per client.
          const convIds = (convs ?? []).map((c: any) => c.id);
          const clientIds = (convs ?? []).map((c: any) => c.client_id).filter(Boolean);

          const [lastMsgRes, pkgRes] = await Promise.all([
            convIds.length
              ? (supabaseAdmin.from("messages") as any)
                  .select("conversation_id, role, content, created_at, created_by, staff_display_name")
                  .in("conversation_id", convIds)
                  .order("created_at", { ascending: false })
                  .limit(convIds.length * 5)
              : { data: [] as any[] },
            clientIds.length
              ? (supabaseAdmin.from("packages") as any)
                  .select("client_id, tracking_number, status, created_at")
                  .in("client_id", clientIds)
                  .order("created_at", { ascending: false })
                  .limit(clientIds.length * 3)
              : { data: [] as any[] },
          ]);

          const lastByConv = new Map<string, any>();
          for (const m of (lastMsgRes.data ?? [])) {
            if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
          }
          const pkgByClient = new Map<string, any>();
          for (const p of (pkgRes.data ?? [])) {
            if (!pkgByClient.has(p.client_id)) pkgByClient.set(p.client_id, p);
          }

          const data = (convs ?? []).map((c: any) => ({
            ...c,
            last_message: lastByConv.get(c.id) ?? null,
            latest_package: c.client_id ? pkgByClient.get(c.client_id) ?? null : null,
            handoff_status: c.ai_enabled ? "ai" : (c.assigned_staff_id ? "human" : "unassigned"),
          }));

          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
    },
  },
});
