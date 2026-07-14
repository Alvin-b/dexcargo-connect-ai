import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticate,
  apiJson,
  preflight,
  readJson,
  badRequest,
  serverError,
} from "@/server/api-auth";
import { logAudit } from "@/server/audit";

// GET  /api/mobile/payment-notifications?status=pending|linked|all&limit=&offset=
// POST /api/mobile/payment-notifications  (admin only)
//   { evidence_type: "image"|"text", image_url?, text_content?, note?, reported_amount?, reported_currency? }
export const Route = createFileRoute("/api/mobile/payment-notifications")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const url = new URL(request.url);
          const status = (url.searchParams.get("status") ?? "pending").toLowerCase();
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
          const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

          let q: any = (supabaseAdmin.from("payment_notifications") as any)
            .select("*", { count: "exact" })
            .order("uploaded_at", { ascending: false })
            .range(offset, offset + limit - 1);
          if (status !== "all") q = q.eq("status", status);

          const { data, error, count } = await q;
          if (error) throw error;
          return apiJson({ items: data ?? [], total: count ?? 0, limit, offset });
        } catch (e) {
          return serverError(e);
        }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const evidence_type = String(body?.evidence_type ?? "").toLowerCase();
          if (evidence_type !== "image" && evidence_type !== "text") {
            return badRequest("evidence_type must be 'image' or 'text'");
          }
          const image_url = body?.image_url ?? null;
          const text_content = body?.text_content ?? null;
          if (evidence_type === "image" && !image_url) return badRequest("image_url required for image evidence");
          if (evidence_type === "text" && !text_content) return badRequest("text_content required for text evidence");

          const insert = {
            evidence_type,
            image_url,
            text_content,
            note: body?.note ?? null,
            reported_amount: body?.reported_amount ?? null,
            reported_currency: body?.reported_currency ?? "KES",
            uploaded_by: auth.userId,
          };
          const { data, error } = await (supabaseAdmin.from("payment_notifications") as any)
            .insert(insert)
            .select("*")
            .single();
          if (error) throw error;

          await logAudit({
            actorId: auth.userId,
            action: "payment_notification.created",
            resourceType: "payment_notification",
            resourceId: data.id,
            metadata: { evidence_type, notification_number: data.notification_number },
            request,
          });
          return apiJson({ ok: true, notification: data }, 201);
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
