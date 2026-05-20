import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, serverError } from "@/server/api-auth";
import { logAudit } from "@/server/audit";

export const Route = createFileRoute("/api/mobile/rates")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          let q = (supabaseAdmin.from("rates") as any).select("*").order("destination_country");
          const country = url.searchParams.get("destination_country");
          const mode = url.searchParams.get("mode");
          const cargoType = url.searchParams.get("cargo_type");
          const specialCargoType = url.searchParams.get("special_cargo_type");
          const activeOnly = url.searchParams.get("active") !== "false";
          if (country) q = q.ilike("destination_country", `%${country}%`);
          if (mode) q = q.eq("mode", mode);
          if (cargoType) q = q.eq("cargo_type", cargoType);
          if (specialCargoType) q = q.eq("special_cargo_type", specialCargoType);
          if (activeOnly) q = q.eq("active", true);
          const { data, error } = await q;
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const { data, error } = await (supabaseAdmin.from("rates") as any).insert(body).select().single();
          if (error) throw error;
          await logAudit({
            actorId: auth.userId,
            action: "rate.created",
            resourceType: "rate",
            resourceId: String(data?.id ?? ""),
            metadata: body ?? {},
            request,
          });
          return apiJson(data, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
