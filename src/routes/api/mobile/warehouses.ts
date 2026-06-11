import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

// GET /api/mobile/warehouses?country_code=CN&role=origin
export const Route = createFileRoute("/api/mobile/warehouses")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          let q = supabaseAdmin.from("warehouses").select("*").eq("active", true);
          const cc = url.searchParams.get("country_code");
          const role = url.searchParams.get("role");
          if (cc) q = q.eq("country_code", cc);
          if (role) q = q.eq("role", role);
          const { data, error } = await q.order("code");
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
    },
  },
});