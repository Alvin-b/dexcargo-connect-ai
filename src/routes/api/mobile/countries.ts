import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

// GET /api/mobile/countries — list configured countries (mobile + desktop)
export const Route = createFileRoute("/api/mobile/countries")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data, error } = await supabaseAdmin
            .from("countries").select("*").eq("active", true).order("name");
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
    },
  },
});