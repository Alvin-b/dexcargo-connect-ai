import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

// List active rates with optional filters by destination/mode/category.
export const Route = createFileRoute("/api/mobile/rates/lookup")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          let q = (supabaseAdmin.from("rates") as any).select("*").eq("active", true).order("destination_country");
          const dest = url.searchParams.get("destination_country");
          const mode = url.searchParams.get("mode");
          const category = url.searchParams.get("category");
          const cargoType = url.searchParams.get("cargo_type");
          const specialCargoType = url.searchParams.get("special_cargo_type");
          if (dest) q = q.eq("destination_country", dest);
          if (mode) q = q.eq("mode", mode);
          if (category) q = q.eq("category", category);
          if (cargoType) q = q.eq("cargo_type", cargoType);
          if (specialCargoType) q = q.eq("special_cargo_type", specialCargoType);
          const { data, error } = await q;
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
    },
  },
});
