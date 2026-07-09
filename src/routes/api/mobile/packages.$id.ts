import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, notFound, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/packages/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data } = await (supabaseAdmin.from("packages") as any)
            .select("*, customers(*)").eq("id", params.id).maybeSingle();
          if (!data) return notFound("package not found");
          const [{ data: history }, { data: images }, { data: delivery }] = await Promise.all([
            (supabaseAdmin.from("package_status_history") as any).select("*").eq("package_id", params.id).order("created_at", { ascending: true }),
            (supabaseAdmin.from("package_images") as any).select("*").eq("package_id", params.id),
            (supabaseAdmin.from("deliveries") as any).select("*").eq("package_id", params.id).maybeSingle(),
          ]);
          return apiJson({ ...data, history: history ?? [], images: images ?? [], delivery: delivery ?? null });
        } catch (e) { return serverError(e); }
      },
      PATCH: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const { data, error } = await (supabaseAdmin.from("packages") as any).update(body ?? {}).eq("id", params.id).select().maybeSingle();
          if (error) throw error;
          if (!data) return notFound("package not found");
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
      DELETE: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const { error } = await (supabaseAdmin.from("packages") as any).delete().eq("id", params.id);
          if (error) throw error;
          return apiJson({ ok: true });
        } catch (e) { return serverError(e); }
      },
    },
  },
});