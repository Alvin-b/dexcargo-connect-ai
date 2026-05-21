import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { assignConversation } from "@/server/conversation-assignment";

async function loadConversationForStaff(id: string, auth: any) {
  let { data: conv, error } = await (supabaseAdmin.from("conversations") as any)
    .select("*, clients(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!conv) return { conv: null, response: notFound() };
  if (!conv.assigned_staff_id) {
    const assigned = await assignConversation(conv.id, conv.assigned_staff_id);
    if (assigned) conv = { ...conv, assigned_staff_id: assigned.id, assigned_at: assigned.assigned_at };
  }
  if (!auth.isAdmin && conv.assigned_staff_id !== auth.userId) {
    return { conv: null, response: notFound("conversation not assigned to this staff member") };
  }
  return { conv, response: null };
}

export const Route = createFileRoute("/api/mobile/conversations/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { conv, response } = await loadConversationForStaff(params.id, auth);
          if (response) return response;
          const { data: messages } = await supabaseAdmin.from("messages").select("*").eq("conversation_id", params.id).order("created_at", { ascending: true });
          return apiJson({ ...conv, messages: messages ?? [] });
        } catch (e) { return serverError(e); }
      },
      PATCH: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { conv, response } = await loadConversationForStaff(params.id, auth);
          if (response) return response;
          const body = await readJson<any>(request);
          const patch: any = {};
          if (typeof body?.ai_enabled === "boolean") patch.ai_enabled = body.ai_enabled;
          if (body?.client_id) {
            if (!auth.isAdmin) return badRequest("only admin can re-link a client");
            patch.client_id = body.client_id;
          }
          if (!Object.keys(patch).length) return apiJson(conv);
          const { data, error } = await supabaseAdmin.from("conversations").update(patch).eq("id", params.id).select().maybeSingle();
          if (error) throw error;
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
