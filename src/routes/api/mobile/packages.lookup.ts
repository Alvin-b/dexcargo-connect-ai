import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, badRequest, serverError } from "@/server/api-auth";

// Quick lookup by tracking_number (used by the scan + pickup screens).
// GET /api/mobile/packages/lookup?tracking_number=XYZ
export const Route = createFileRoute("/api/mobile/packages/lookup")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const tn = url.searchParams.get("tracking_number");
          if (!tn) return badRequest("tracking_number required");
          const autoRegister = url.searchParams.get("auto_register") === "1";

          const { data, error } = await (supabaseAdmin.from("packages") as any)
            .select("*, clients(*), package_events(*), delivery_signatures(*)")
            .or(`tracking_number.eq.${tn},external_barcode.eq.${tn},remark.eq.${tn}`)
            .maybeSingle();
          if (error) throw error;
          if (data) return apiJson({ ...data, auto_registered: false });

          const { data: nestedData, error: nestedError } = await supabaseAdmin
            .from("packages")
            .select("*, clients(*), package_events(*), delivery_signatures(*)")
            .contains("qr_payload", { tracking_number: tn } as any)
            .maybeSingle();
          if (nestedError) throw nestedError;
          if (nestedData) return apiJson({ ...nestedData, auto_registered: false });

          if (!autoRegister) {
            return apiJson({ error: "package not found" }, 404);
          }

          // Auto-register an unknown tracking number as a pending package so it can be scanned on arrival
          const { data: created, error: insErr } = await supabaseAdmin
            .from("packages")
            .insert({ tracking_number: tn, status: "pending", description: "Auto-registered on scan" })
            .select("*, clients(*), package_events(*), delivery_signatures(*)")
            .single();
          if (insErr) throw insErr;
          await supabaseAdmin.from("package_events").insert({
            package_id: created.id, status: "pending",
            notes: "Package auto-registered via scan lookup", created_by: auth.userId,
          });
          return apiJson({ ...created, auto_registered: true }, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
