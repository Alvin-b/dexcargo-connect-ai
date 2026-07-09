import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";

// POST /api/mobile/packages/scan  { code: string }  — resolves QR token, barcode or tracking number
export const Route = createFileRoute("/api/mobile/packages/scan")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const code = String(body?.code ?? "").trim();
          if (!code) return badRequest("code required");
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(code);
          let q: any = (supabaseAdmin.from("packages") as any).select("*, customers(*)");
          q = isUuid
            ? q.or(`qr_code_token.eq.${code},id.eq.${code}`)
            : q.or(`tracking_number.eq.${code},external_barcode.eq.${code},barcode.eq.${code}`);
          const { data } = await q.limit(1).maybeSingle();
          if (!data) return notFound("package not found");
          return apiJson({ package: data });
        } catch (e) { return serverError(e); }
      },
    },
  },
});