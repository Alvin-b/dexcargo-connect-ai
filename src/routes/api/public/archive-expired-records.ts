import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/archive-expired-records")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { data, error } = await (supabaseAdmin as any).rpc("archive_expired_delivery_records");
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: true, archived_signatures: data ?? 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
