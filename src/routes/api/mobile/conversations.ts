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
          let query = (supabaseAdmin.from("conversations") as any)
            .select("*, clients(full_name, whatsapp_number)")
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .limit(limit);
          if (!auth.isAdmin) query = query.eq("assigned_staff_id", auth.userId);
          const { data, error } = await query;
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
    },
  },
});
