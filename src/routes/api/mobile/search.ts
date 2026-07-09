import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, badRequest, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/search")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const q = (url.searchParams.get("q") ?? "").trim();
          if (!q) return badRequest("q required");
          const like = `%${q}%`;
          const [pkgs, custs, emps] = await Promise.all([
            (supabaseAdmin.from("packages") as any).select("id, tracking_number, external_barcode, status, amount_due, customer_id, received_at")
              .or(`tracking_number.ilike.${like},external_barcode.ilike.${like},barcode.ilike.${like},description.ilike.${like}`).limit(25),
            (supabaseAdmin.from("customers") as any).select("id, full_name, phone, whatsapp_number, national_id")
              .or(`full_name.ilike.${like},phone.ilike.${like},national_id.ilike.${like},email.ilike.${like}`).limit(25),
            (supabaseAdmin.from("employees") as any).select("id, employee_code, full_name, email, phone, role, status")
              .or(`employee_code.ilike.${like},full_name.ilike.${like},email.ilike.${like}`).limit(15),
          ]);
          return apiJson({ query: q, packages: pkgs.data ?? [], customers: custs.data ?? [], employees: emps.data ?? [] });
        } catch (e) { return serverError(e); }
      },
    },
  },
});