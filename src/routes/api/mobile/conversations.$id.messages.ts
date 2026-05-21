import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText, sendWhatsAppImage } from "@/server/evolution";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { assignConversation } from "@/server/conversation-assignment";

async function assertConversationAccess(id: string, auth: any) {
  let { data: conv, error } = await (supabaseAdmin.from("conversations") as any)
    .select("id, whatsapp_number, assigned_staff_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!conv) return { conv: null, response: notFound("conversation not found") };
  if (!conv.assigned_staff_id) {
    const assigned = await assignConversation(conv.id, conv.assigned_staff_id);
    if (assigned) conv = { ...conv, assigned_staff_id: assigned.id };
  }
  if (!auth.isAdmin && conv.assigned_staff_id !== auth.userId) {
    return { conv: null, response: notFound("conversation not assigned to this staff member") };
  }
  return { conv, response: null };
}

export const Route = createFileRoute("/api/mobile/conversations/$id/messages")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { response } = await assertConversationAccess(params.id, auth);
          if (response) return response;
          const { data, error } = await supabaseAdmin.from("messages").select("*").eq("conversation_id", params.id).order("created_at", { ascending: true });
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.content && !body?.media_url) return badRequest("content or media_url required");
          const { conv, response } = await assertConversationAccess(params.id, auth);
          if (response) return response;
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("display_name")
            .eq("id", auth.userId)
            .maybeSingle();
          // Send via Evolution
          if (body.media_url) await sendWhatsAppImage(conv.whatsapp_number, body.media_url, body.content ?? "");
          else await sendWhatsAppText(conv.whatsapp_number, body.content);
          // Persist
          const { data, error } = await (supabaseAdmin.from("messages") as any).insert({
            conversation_id: params.id,
            role: "staff",
            content: body.content ?? null,
            media_url: body.media_url ?? null,
            created_by: auth.userId,
            staff_display_name: profile?.display_name ?? null,
          }).select().single();
          if (error) throw error;
          await supabaseAdmin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", params.id);
          return apiJson(data, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
