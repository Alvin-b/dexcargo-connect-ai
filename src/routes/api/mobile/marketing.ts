import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/marketing")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const status = url.searchParams.get("status");
          let q = supabaseAdmin.from("marketing_posts").select("*").order("created_at", { ascending: false });
          if (status) q = q.eq("status", status as any);
          const { data, error } = await q;
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.content || !body?.platform) return badRequest("content and platform required");
          const { data, error } = await supabaseAdmin.from("marketing_posts").insert({
            content: body.content,
            platform: body.platform,
            hashtags: body.hashtags ?? null,
            image_url: body.image_url ?? null,
            scheduled_for: body.scheduled_for ?? null,
            status: body.status ?? "draft",
            created_by: auth.userId,
          }).select().single();
          if (error) throw error;
          return apiJson(data, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});