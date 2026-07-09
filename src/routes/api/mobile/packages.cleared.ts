import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/packages/cleared")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
          let q: any = (supabaseAdmin.from("packages") as any)
            .select("*, customers(full_name, phone), deliveries(*)", { count: "exact" })
            .in("status", ["collected", "cleared"])
            .order("collected_at", { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);
          const since = url.searchParams.get("since"); if (since) q = q.gte("collected_at", since);
          const search = url.searchParams.get("q");
          if (search) q = q.or(`tracking_number.ilike.%${search}%,external_barcode.ilike.%${search}%`);
          const { data, count, error } = await q;
          if (error) throw error;
          const enriched = (data ?? []).map((row: any) => {
            const rec = row.received_at ? new Date(row.received_at).getTime() : null;
            const col = row.collected_at ? new Date(row.collected_at).getTime() : null;
            return { ...row, dwell_hours: rec && col ? Math.round(((col - rec) / 3_600_000) * 10) / 10 : null };
          });
          return apiJson({ data: enriched, count, limit, offset });
        } catch (e) { return serverError(e); }
      },
    },
  },
});