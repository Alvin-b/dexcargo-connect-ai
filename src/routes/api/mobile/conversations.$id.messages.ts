import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText, sendWhatsAppImage } from "@/server/evolution";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/conversations/$id/messages")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
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
          const { data: conv } = await supabaseAdmin.from("conversations").select("whatsapp_number").eq("id", params.id).maybeSingle();
          if (!conv) return notFound("conversation not found");
          // Send via Evolution
          if (body.media_url) await sendWhatsAppImage(conv.whatsapp_number, body.media_url, body.content ?? "");
          else await sendWhatsAppText(conv.whatsapp_number, body.content);
          // Persist
          const { data, error } = await supabaseAdmin.from("messages").insert({
            conversation_id: params.id,
            role: "staff",
            content: body.content ?? null,
            media_url: body.media_url ?? null,
          }).select().single();
          if (error) throw error;
          await supabaseAdmin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", params.id);
          return apiJson(data, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});