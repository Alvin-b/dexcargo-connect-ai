import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/marketing/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data } = await supabaseAdmin.from("marketing_posts").select("*").eq("id", params.id).maybeSingle();
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
      PATCH: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const { data, error } = await supabaseAdmin.from("marketing_posts").update(body ?? {}).eq("id", params.id).select().maybeSingle();
          if (error) throw error;
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
      DELETE: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { error } = await supabaseAdmin.from("marketing_posts").delete().eq("id", params.id);
          if (error) throw error;
          return apiJson({ ok: true });
        } catch (e) { return serverError(e); }
      },
    },
  },
});