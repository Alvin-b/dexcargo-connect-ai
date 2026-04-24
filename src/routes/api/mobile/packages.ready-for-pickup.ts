import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

// Pickup queue: packages that have arrived and are awaiting client collection.
// Supports search (name / phone / tracking number) for the front-desk workflow.
export const Route = createFileRoute("/api/mobile/packages/ready-for-pickup")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const q = url.searchParams.get("q");
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);

          let query = supabaseAdmin
            .from("packages")
            .select("*, clients(full_name, whatsapp_number, email)", { count: "exact" })
            .in("status", ["arrived_destination", "out_for_delivery"])
            .order("created_at", { ascending: false })
            .limit(limit);
          if (q) query = query.or(`tracking_number.ilike.%${q}%,description.ilike.%${q}%,sender_name.ilike.%${q}%,sender_phone.ilike.%${q}%`);

          const { data, count, error } = await query;
          if (error) throw error;
          return apiJson({ data, count });
        } catch (e) { return serverError(e); }
      },
    },
  },
});