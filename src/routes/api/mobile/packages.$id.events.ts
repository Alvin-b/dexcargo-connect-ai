import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/packages/$id/events")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data, error } = await supabaseAdmin.from("package_events").select("*").eq("package_id", params.id).order("created_at", { ascending: true });
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.status) return badRequest("status required");
          const { data, error } = await supabaseAdmin.from("package_events").insert({
            package_id: params.id,
            status: body.status,
            location: body.location ?? null,
            notes: body.notes ?? null,
            photo_url: body.photo_url ?? null,
            created_by: auth.userId,
          }).select().single();
          if (error) throw error;
          // Mirror current status onto the package
          await supabaseAdmin.from("packages").update({ status: body.status }).eq("id", params.id);
          return apiJson(data, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});