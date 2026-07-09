import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/customers")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const q = url.searchParams.get("q");
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
          let query: any = (supabaseAdmin.from("customers") as any).select("*", { count: "exact" })
            .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
          if (url.searchParams.get("is_active")) query = query.eq("is_active", url.searchParams.get("is_active") === "true");
          if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,national_id.ilike.%${q}%,email.ilike.%${q}%`);
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
          if (!body?.full_name || !body?.phone) return badRequest("full_name and phone required");
          const { data, error } = await (supabaseAdmin.from("customers") as any).insert({
            full_name: body.full_name, phone: String(body.phone).replace(/\s+/g, ""),
            whatsapp_number: body.whatsapp_number ?? null, national_id: body.national_id ?? null,
            email: body.email ?? null, default_address: body.default_address ?? null,
            city: body.city ?? null, notes: body.notes ?? null, created_by: auth.userId,
          }).select().single();
          if (error) throw error;
          return apiJson({ ok: true, customer: data }, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});