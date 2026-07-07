import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, badRequest, serverError } from "@/server/api-auth";

// GET /api/mobile/search?q=...
// Unified search across packages (tracking, mpesa code, recipient, sender),
// employees (code, name, email, phone) and payments (mpesa code).
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

          const [packages, employees, payments] = await Promise.all([
            (supabaseAdmin.from("packages") as any).select(
              "id, tracking_number, external_barcode, sender_name, sender_phone, recipient_name, recipient_phone, mpesa_code, status, released_at, intake_photo_url",
            ).or(
              `tracking_number.ilike.${like},external_barcode.ilike.${like},sender_name.ilike.${like},sender_phone.ilike.${like},recipient_name.ilike.${like},recipient_phone.ilike.${like},mpesa_code.ilike.${like},remark.ilike.${like}`,
            ).limit(25),
            (supabaseAdmin.from("employees") as any).select("id, employee_code, full_name, email, phone, role, status")
              .or(`employee_code.ilike.${like},full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(15),
            (supabaseAdmin.from("payments") as any).select("id, package_id, amount, method, mpesa_code, status, created_at")
              .or(`mpesa_code.ilike.${like}`).limit(25),
          ]);

          return apiJson({
            query: q,
            packages: packages.data ?? [],
            employees: employees.data ?? [],
            payments: payments.data ?? [],
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});