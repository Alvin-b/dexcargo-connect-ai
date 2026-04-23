import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, notFound, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/conversations/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data: conv, error } = await supabaseAdmin.from("conversations").select("*, clients(*)").eq("id", params.id).maybeSingle();
          if (error) throw error;
          if (!conv) return notFound();
          const { data: messages } = await supabaseAdmin.from("messages").select("*").eq("conversation_id", params.id).order("created_at", { ascending: true });
          return apiJson({ ...conv, messages: messages ?? [] });
        } catch (e) { return serverError(e); }
      },
      PATCH: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const patch: any = {};
          if (typeof body?.ai_enabled === "boolean") patch.ai_enabled = body.ai_enabled;
          if (body?.client_id) patch.client_id = body.client_id;
          const { data, error } = await supabaseAdmin.from("conversations").update(patch).eq("id", params.id).select().maybeSingle();
          if (error) throw error;
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
    },
  },
});