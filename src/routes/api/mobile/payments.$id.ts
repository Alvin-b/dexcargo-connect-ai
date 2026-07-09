import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, notFound, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/payments/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data } = await (supabaseAdmin.from("payments") as any)
            .select("*, packages(tracking_number), customers(full_name, phone)")
            .eq("id", params.id).maybeSingle();
          if (!data) return notFound("payment not found");
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
    },
  },
});