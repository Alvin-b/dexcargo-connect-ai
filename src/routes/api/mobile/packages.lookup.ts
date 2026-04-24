import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, badRequest, notFound, serverError } from "@/server/api-auth";

// Quick lookup by tracking_number (used by the scan + pickup screens).
// GET /api/mobile/packages/lookup?tracking_number=XYZ
export const Route = createFileRoute("/api/mobile/packages/lookup")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const tn = url.searchParams.get("tracking_number");
          if (!tn) return badRequest("tracking_number required");
          const { data, error } = await supabaseAdmin
            .from("packages")
            .select("*, clients(*), package_events(*), delivery_signatures(*)")
            .eq("tracking_number", tn).maybeSingle();
          if (error) throw error;
          if (!data) return notFound("package not found");
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
    },
  },
});