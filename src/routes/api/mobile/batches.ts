import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

// List & create loading batches.
// GET  /api/mobile/batches?status=active
// POST /api/mobile/batches  { batch_code, loading_date, cutoff_at?, origin_warehouse?, destination_warehouse?, notes? }
export const Route = createFileRoute("/api/mobile/batches")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request, { location: "china" });
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const status = url.searchParams.get("status");
          const origin = url.searchParams.get("origin_warehouse");
          let q = supabaseAdmin.from("loading_batches").select("*").order("loading_date", { ascending: false }).limit(100);
          if (status) q = q.eq("status", status);
          if (origin) q = q.eq("origin_warehouse", origin);
          const { data, error } = await q;
          if (error) throw error;
          return apiJson({ data });
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request, { location: "china" });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.batch_code) return badRequest("batch_code required");
          if (!body?.loading_date) return badRequest("loading_date required");

          const cutoff = body.cutoff_at ?? new Date().toISOString();
          // Compute expected_total = packages received before cutoff still in received_in_china
          const { count: expected } = await supabaseAdmin
            .from("packages")
            .select("id", { count: "exact", head: true })
            .eq("status", "received_in_china")
            .lte("received_at", cutoff);

          const { data, error } = await supabaseAdmin.from("loading_batches").insert({
            batch_code: body.batch_code,
            loading_date: body.loading_date,
            cutoff_at: cutoff,
            origin_warehouse: body.origin_warehouse ?? "china",
            destination_warehouse: body.destination_warehouse ?? "kenya",
            notes: body.notes ?? null,
            expected_total: expected ?? 0,
            created_by: auth.userId,
          }).select().single();
          if (error) throw error;
          return apiJson(data, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
