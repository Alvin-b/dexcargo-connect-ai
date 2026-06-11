import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

// GET /api/desktop/left-behind?cutoff_days=14
// Lists packages still in China that have never been loaded into any batch.
// `cutoff_days` (default 7) filters to packages received at least N days ago.
export const Route = createFileRoute("/api/desktop/left-behind")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request, { location: "china" });
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const cutoffDays = Math.max(0, Number(url.searchParams.get("cutoff_days") ?? 7));
          const cutoffIso = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000).toISOString();
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);

          // packages still received_in_china or on_hold, received before cutoff
          const { data: candidates, error } = await supabaseAdmin
            .from("packages")
            .select("*, clients(full_name, whatsapp_number)")
            .in("status", ["received_in_china", "on_hold"])
            .lte("received_at", cutoffIso)
            .order("received_at", { ascending: true })
            .limit(limit);
          if (error) throw error;

          const ids = (candidates ?? []).map((p) => p.id);
          if (ids.length === 0) return apiJson({ data: [], cutoff_at: cutoffIso });

          // exclude any that ARE already loaded into a batch
          const { data: loaded } = await supabaseAdmin
            .from("batch_packages")
            .select("package_id")
            .in("package_id", ids);
          const loadedSet = new Set((loaded ?? []).map((b: any) => b.package_id));
          const data = (candidates ?? [])
            .filter((p) => !loadedSet.has(p.id))
            .map((p: any) => ({
              ...p,
              days_in_warehouse: p.received_at
                ? Math.max(0, Math.floor((Date.now() - new Date(p.received_at).getTime()) / 86_400_000))
                : null,
            }));

          return apiJson({ data, cutoff_at: cutoffIso });
        } catch (e) { return serverError(e); }
      },
    },
  },
});