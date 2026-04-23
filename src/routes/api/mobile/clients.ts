import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/clients")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const q = url.searchParams.get("q") ?? "";
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
          let query = supabaseAdmin.from("clients").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
          if (q) query = query.or(`full_name.ilike.%${q}%,whatsapp_number.ilike.%${q}%,email.ilike.%${q}%`);
          const { data, count, error } = await query;
          if (error) throw error;
          return apiJson({ data, count, limit, offset });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.full_name || !body?.whatsapp_number) return badRequest("full_name and whatsapp_number required");
          const { data, error } = await supabaseAdmin.from("clients").insert({
            full_name: body.full_name,
            whatsapp_number: String(body.whatsapp_number).replace(/\D/g, ""),
            email: body.email ?? null,
            country: body.country ?? null,
            city: body.city ?? null,
            address: body.address ?? null,
            notes: body.notes ?? null,
          }).select().single();
          if (error) throw error;
          return apiJson(data, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});