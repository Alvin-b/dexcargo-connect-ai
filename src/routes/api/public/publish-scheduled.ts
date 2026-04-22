import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishPost } from "@/server/social";

// Cron endpoint: publishes all marketing_posts where status='scheduled' and scheduled_for <= now()
// Configure pg_cron to call this every minute. Uses a shared secret.
//   POST https://<domain>/api/public/publish-scheduled?secret=<EVOLUTION_WEBHOOK_SECRET>
export const Route = createFileRoute("/api/public/publish-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
        if (expected) {
          const url = new URL(request.url);
          const provided = url.searchParams.get("secret") || request.headers.get("x-cron-secret");
          if (provided !== expected) return new Response("Unauthorized", { status: 401 });
        }
        const sb = supabaseAdmin;
        const { data: due } = await sb.from("marketing_posts")
          .select("id, platform")
          .eq("status", "scheduled")
          .lte("scheduled_for", new Date().toISOString())
          .limit(20);
        const results: any[] = [];
        for (const p of due ?? []) {
          try {
            const r = await publishPost(p.id);
            results.push({ id: p.id, ok: r.ok });
          } catch (e: any) {
            results.push({ id: p.id, ok: false, error: e?.message });
          }
        }
        return new Response(JSON.stringify({ processed: results.length, results }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});