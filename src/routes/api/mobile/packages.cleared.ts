import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, serverError } from "@/server/api-auth";

// GET /api/mobile/packages/cleared?since=&until=&employee_id=&q=&limit=&offset=
// Full archive of released/cleared packages with everything needed on the receipt.
export const Route = createFileRoute("/api/mobile/packages/cleared")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
          let q = (supabaseAdmin.from("packages") as any).select(
            `id, tracking_number, external_barcode, sender_name, sender_phone,
             recipient_name, recipient_id_number, recipient_phone,
             total_charge, shipping_cost, mpesa_code, payment_method, payment_status,
             intake_photo_url, ocr_payload, received_at, released_at, cleared_at,
             received_by:received_by_employee_id(id, employee_code, full_name),
             released_by:released_by_employee_id(id, employee_code, full_name)`,
            { count: "exact" },
          )
            .in("status", ["released","cleared"])
            .order("released_at", { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);
          const since = url.searchParams.get("since"); if (since) q = q.gte("released_at", since);
          const until = url.searchParams.get("until"); if (until) q = q.lte("released_at", until);
          const empId = url.searchParams.get("employee_id"); if (empId) q = q.eq("released_by_employee_id", empId);
          const search = url.searchParams.get("q");
          if (search) q = q.or(`tracking_number.ilike.%${search}%,recipient_name.ilike.%${search}%,recipient_phone.ilike.%${search}%,mpesa_code.ilike.%${search}%,sender_name.ilike.%${search}%`);
          const { data, count, error } = await q;
          if (error) throw error;
          const enriched = (data ?? []).map((row: any) => {
            const received = row.received_at ? new Date(row.received_at).getTime() : null;
            const released = row.released_at ? new Date(row.released_at).getTime() : null;
            const dwellHours = received && released ? Math.round(((released - received) / 3_600_000) * 10) / 10 : null;
            return { ...row, dwell_hours: dwellHours };
          });
          return apiJson({ data: enriched, count, limit, offset });
        } catch (e) { return serverError(e); }
      },
    },
  },
});