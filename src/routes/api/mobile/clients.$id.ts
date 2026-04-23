import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, notFound, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/clients/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data, error } = await supabaseAdmin.from("clients").select("*").eq("id", params.id).maybeSingle();
          if (error) throw error;
          if (!data) return notFound("client not found");
          const { data: packages } = await supabaseAdmin.from("packages").select("*").eq("client_id", params.id).order("created_at", { ascending: false });
          return apiJson({ ...data, packages: packages ?? [] });
        } catch (e) { return serverError(e); }
      },
      PATCH: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const { data, error } = await supabaseAdmin.from("clients").update(body ?? {}).eq("id", params.id).select().maybeSingle();
          if (error) throw error;
          if (!data) return notFound("client not found");
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
      DELETE: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const { error } = await supabaseAdmin.from("clients").delete().eq("id", params.id);
          if (error) throw error;
          return apiJson({ ok: true });
        } catch (e) { return serverError(e); }
      },
    },
  },
});