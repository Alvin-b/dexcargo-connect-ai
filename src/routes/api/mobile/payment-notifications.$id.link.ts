import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticate,
  apiJson,
  preflight,
  readJson,
  badRequest,
  notFound,
  serverError,
} from "@/server/api-auth";
import { logAudit } from "@/server/audit";
import { getEmployeeByUserId } from "@/server/employees";

// POST /api/mobile/payment-notifications/:id/link
// Body: { orders: [ { package_id?, tracking_number?, allocated_amount?, notes? }, ... ] }
// - Staff-only. Manually links one payment notification to one or more packages.
// - Marks the notification as LINKED (no longer appears in the pending inbox).
// - Never deletes anything.
export const Route = createFileRoute("/api/mobile/payment-notifications/$id/link")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const orders: any[] = Array.isArray(body?.orders) ? body.orders : [];
          if (orders.length === 0) return badRequest("orders array required");

          const { data: notif, error: notifErr } = await (supabaseAdmin.from("payment_notifications") as any)
            .select("*").eq("id", params.id).maybeSingle();
          if (notifErr) throw notifErr;
          if (!notif) return notFound("payment notification not found");

          const emp = await getEmployeeByUserId(auth.userId);
          const created: any[] = [];

          for (const o of orders) {
            // Resolve package by id or tracking_number/barcode
            let pkg: any = null;
            if (o?.package_id) {
              const { data } = await (supabaseAdmin.from("packages") as any)
                .select("id, tracking_number").eq("id", o.package_id).maybeSingle();
              pkg = data;
            } else if (o?.tracking_number) {
              const code = String(o.tracking_number).trim();
              const { data } = await (supabaseAdmin.from("packages") as any)
                .select("id, tracking_number")
                .or(`tracking_number.eq.${code},external_barcode.eq.${code},barcode.eq.${code}`)
                .limit(1).maybeSingle();
              pkg = data;
            }
            if (!pkg) return badRequest(`order not found: ${o?.tracking_number ?? o?.package_id ?? "unknown"}`);

            const { data: alloc, error: aErr } = await (supabaseAdmin.from("payment_notification_allocations") as any)
              .insert({
                payment_notification_id: params.id,
                package_id: pkg.id,
                tracking_number: pkg.tracking_number,
                allocated_amount: o?.allocated_amount ?? null,
                allocated_currency: o?.allocated_currency ?? "KES",
                notes: o?.notes ?? null,
                linked_by: auth.userId,
                linked_by_employee_id: emp?.id ?? null,
              })
              .select("*").single();
            if (aErr) {
              // Ignore duplicate allocations (unique constraint); surface others.
              if (!String(aErr.message ?? "").toLowerCase().includes("duplicate")) throw aErr;
            } else {
              created.push(alloc);
            }
          }

          // Flip status to linked (idempotent).
          const { data: updated, error: uErr } = await (supabaseAdmin.from("payment_notifications") as any)
            .update({ status: "linked", linked_at: new Date().toISOString(), linked_by: auth.userId })
            .eq("id", params.id)
            .select("*").single();
          if (uErr) throw uErr;

          await logAudit({
            actorId: auth.userId,
            action: "payment_notification.linked",
            resourceType: "payment_notification",
            resourceId: params.id,
            metadata: {
              notification_number: updated.notification_number,
              linked_packages: created.map((a) => ({ package_id: a.package_id, tracking_number: a.tracking_number, allocated_amount: a.allocated_amount })),
            },
            request,
          });

          return apiJson({ ok: true, notification: updated, allocations: created });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
