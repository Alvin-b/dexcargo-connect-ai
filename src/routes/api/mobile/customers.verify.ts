import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, badRequest, serverError } from "@/server/api-auth";

// GET /api/mobile/customers/verify?phone=&national_id=&name=
// Used on the "Verify Customer ID" screen before releasing a package. Returns
// candidate customers and, when a package tracking number is supplied, the
// matching package + collection eligibility summary.
export const Route = createFileRoute("/api/mobile/customers/verify")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const phone = url.searchParams.get("phone")?.replace(/\s+/g, "");
          const nationalId = url.searchParams.get("national_id")?.trim();
          const name = url.searchParams.get("name")?.trim();
          const tracking = url.searchParams.get("tracking_number")?.trim();
          if (!phone && !nationalId && !name && !tracking) return badRequest("provide phone, national_id, name, or tracking_number");

          let cq: any = (supabaseAdmin.from("customers") as any)
            .select("id, full_name, phone, whatsapp_number, national_id, email, city").limit(10);
          const filters: string[] = [];
          if (phone) filters.push(`phone.ilike.%${phone}%`);
          if (nationalId) filters.push(`national_id.ilike.%${nationalId}%`);
          if (name) filters.push(`full_name.ilike.%${name}%`);
          if (filters.length) cq = cq.or(filters.join(","));
          const { data: customers, error } = await cq;
          if (error) throw error;

          let pkg: any = null;
          if (tracking) {
            const { data } = await (supabaseAdmin.from("packages") as any)
              .select("id, tracking_number, status, amount_due, amount_paid, customer_id, description, customers(full_name, phone, national_id)")
              .eq("tracking_number", tracking).maybeSingle();
            pkg = data ?? null;
          }

          const eligibility = pkg ? {
            balance_due: Math.max(0, Number(pkg.amount_due ?? 0) - Number(pkg.amount_paid ?? 0)),
            can_release: ["ready_for_collection", "paid", "awaiting_pickup"].includes(pkg.status),
            status: pkg.status,
          } : null;

          return apiJson({ customers: customers ?? [], package: pkg, eligibility });
        } catch (e) { return serverError(e); }
      },
    },
  },
});