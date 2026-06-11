import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";

// POST /api/desktop/left-behind/:id/hold   { reason, release?: boolean }
// Set a left-behind package to on_hold with a reason, or release back to
// received_in_china when { release: true } is passed.
export const Route = createFileRoute("/api/desktop/left-behind/$id/hold")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { location: "china" });
          if (!auth.ok) return auth.response;
          const body = await readJson<{ reason?: string; release?: boolean }>(request);
          const release = body?.release === true;
          if (!release && !body?.reason) return badRequest("reason required");

          const { data: pkg } = await supabaseAdmin
            .from("packages").select("id, status, tracking_number").eq("id", params.id).maybeSingle();
          if (!pkg) return notFound("package not found");

          const newStatus = release ? "received_in_china" : "on_hold";
          await (supabaseAdmin.from("packages") as any)
            .update({ status: newStatus }).eq("id", pkg.id);

          await supabaseAdmin.from("package_events").insert({
            package_id: pkg.id,
            status: newStatus,
            location: "China warehouse",
            notes: release
              ? "Released from hold via desktop app"
              : `Held: ${body!.reason}`,
            created_by: auth.userId,
          });

          return apiJson({ ok: true, status: newStatus });
        } catch (e) { return serverError(e); }
      },
    },
  },
});