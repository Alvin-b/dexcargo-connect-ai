import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, notFound, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/payments/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { location: "kenya" });
          if (!auth.ok) return auth.response;
          // Try by id, then by checkout_request_id
          let { data } = await supabaseAdmin.from("payments").select("*").eq("id", params.id).maybeSingle();
          if (!data) {
            const r = await supabaseAdmin.from("payments").select("*").eq("checkout_request_id", params.id).maybeSingle();
            data = r.data;
          }
          if (!data) return notFound("payment not found");
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
