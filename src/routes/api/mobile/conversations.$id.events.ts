import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, notFound, serverError } from "@/server/api-auth";

// GET /api/mobile/conversations/:id/events
// Immutable assignment/handoff/escalation history for a conversation.
export const Route = createFileRoute("/api/mobile/conversations/$id/events")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;

          const { data: conv } = await (supabaseAdmin.from("conversations") as any)
            .select("id, assigned_staff_id")
            .eq("id", params.id).maybeSingle();
          if (!conv) return notFound("conversation not found");
          if (!auth.isAdmin && conv.assigned_staff_id !== auth.userId) {
            return notFound("conversation not assigned to this staff member");
          }

          const { data, error } = await (supabaseAdmin.from("conversation_assignment_events") as any)
            .select("*")
            .eq("conversation_id", params.id)
            .order("created_at", { ascending: false })
            .limit(200);
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
    },
  },
});