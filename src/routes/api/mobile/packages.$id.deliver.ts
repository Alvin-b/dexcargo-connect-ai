import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";
import { withIdempotency } from "@/server/idempotency";
import { enforceRateLimit } from "@/server/rate-limit";
import { sendPushToAudience } from "@/server/push";
import { logAudit } from "@/server/audit";

// Release a package: verify/record payment, store digital signature, then mark cleared.
export const Route = createFileRoute("/api/mobile/packages/$id/deliver")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { location: "kenya" });
          if (!auth.ok) return auth.response;
          const limited = await enforceRateLimit({ request, endpoint: "deliver", userId: auth.userId, max: 30, windowSeconds: 60 });
          if (limited) return limited;
          return withIdempotency({
            request,
            userId: auth.userId,
            endpoint: `deliver:${params.id}`,
            run: async () => {
          const body = await readJson<any>(request);
          if (!body?.signer_name) return badRequest("signer_name required");
          if (!body?.signature_data_url) return badRequest("signature_data_url required");

          const { data: pkg } = await (supabaseAdmin.from("packages") as any)
            .select("id, tracking_number, client_id, status, payment_status, clients(full_name, whatsapp_number)")
            .eq("id", params.id).maybeSingle();
          if (!pkg) return notFound("package not found");

          let paymentId = body.payment_id ?? null;
          let amountPaid = body.amount_paid ?? null;
          let releaseMethod = body.payment_method ?? null;

          if (paymentId) {
            const { data: payment } = await supabaseAdmin
              .from("payments")
              .select("id, amount, status, raw_callback")
              .eq("id", paymentId)
              .eq("package_id", pkg.id)
              .maybeSingle();
            if (!payment) return badRequest("payment_id does not belong to this package");
            if (payment.status !== "success") return badRequest("payment is not verified yet");
            amountPaid = amountPaid ?? payment.amount;
            releaseMethod = releaseMethod ?? ((payment.raw_callback as any)?.method === "cash" ? "cash" : "mpesa");
          } else {
            const { data: latestPayment } = await supabaseAdmin
              .from("payments")
              .select("id, amount, status, raw_callback")
              .eq("package_id", pkg.id)
              .eq("status", "success")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (latestPayment) {
              paymentId = latestPayment.id;
              amountPaid = amountPaid ?? latestPayment.amount;
              releaseMethod = releaseMethod ?? ((latestPayment.raw_callback as any)?.method === "cash" ? "cash" : "mpesa");
            }
          }

          if (!paymentId && body.payment_method === "cash" && body.amount_paid) {
            const { data: cashPayment, error: cashErr } = await supabaseAdmin.from("payments").insert({
              package_id: pkg.id,
              client_id: pkg.client_id,
              amount: Number(body.amount_paid),
              phone: body.signer_phone ?? "cash",
              currency: body.currency ?? "KES",
              status: "success",
              raw_callback: { method: "cash", recorded_by: auth.userId, notes: body.notes ?? null },
            }).select().single();
            if (cashErr) throw cashErr;
            paymentId = cashPayment.id;
            amountPaid = cashPayment.amount;
            releaseMethod = "cash";
            await (supabaseAdmin.from("packages") as any).update({
              payment_status: "paid",
              payment_method: "cash",
            }).eq("id", pkg.id);
          }

          if (!paymentId && pkg.payment_status !== "paid" && !["cleared", "out_for_delivery"].includes(pkg.status)) {
            return badRequest("package must have a verified payment or recorded cash payment before release");
          }

          const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(String(body.signature_data_url));
          if (!m) return badRequest("signature_data_url must be a base64 image data URL");
          const mime = m[1];
          const ext = (mime.split("/")[1] || "png").replace("+xml", "");
          const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
          const path = `${pkg.id}/${Date.now()}.${ext}`;
          const { error: upErr } = await supabaseAdmin.storage.from("signatures").upload(path, bytes, {
            contentType: mime, upsert: false,
          });
          if (upErr) throw upErr;
          const { data: signed } = await supabaseAdmin.storage.from("signatures").createSignedUrl(path, 60 * 60 * 24 * 365);
          const signatureUrl = signed?.signedUrl ?? path;

          const { data: sig, error: sigErr } = await (supabaseAdmin.from("delivery_signatures") as any).insert({
            package_id: pkg.id,
            signer_name: body.signer_name,
            signer_phone: body.signer_phone ?? null,
            signature_url: signatureUrl,
            signature_path: path,
            signature_mime_type: mime,
            payment_method: releaseMethod ?? body.payment_method ?? "cash",
            amount_paid: amountPaid,
            currency: body.currency ?? "KES",
            payment_id: paymentId,
            notes: body.notes ?? null,
            recorded_by: auth.userId,
          }).select().single();
          if (sigErr) throw sigErr;

          const clearedAt = new Date().toISOString();
          const retentionUntil = new Date(Date.now() + 214 * 86400_000).toISOString();
          await (supabaseAdmin.from("packages") as any).update({
            status: "cleared",
            cleared_at: clearedAt,
            delivered_at: clearedAt,
            payment_status: "paid",
            payment_method: releaseMethod ?? body.payment_method ?? "cash",
            released_by: auth.userId,
            pickup_retention_until: retentionUntil,
          }).eq("id", pkg.id);
          const { data: ev } = await (supabaseAdmin.from("package_events") as any).insert({
            package_id: pkg.id,
            status: "cleared",
            notes: `Cleared and released to ${body.signer_name}${releaseMethod ? ` (paid via ${releaseMethod})` : ""}`,
            created_by: auth.userId,
          }).select().single();

          const client = (pkg as any).clients;
          if (client?.whatsapp_number) {
            try {
              const { sendWhatsAppText } = await import("@/server/evolution");
              await sendWhatsAppText(
                client.whatsapp_number,
                `Package ${pkg.tracking_number} has been cleared and released to ${body.signer_name}. Thank you for shipping with DEX Cargo!`,
              );
            } catch (e) { console.error("deliver notify failed", e); }
          }
          try {
            await sendPushToAudience("kenya", {
              title: "Package cleared",
              body: `${pkg.tracking_number} -> ${body.signer_name}`,
              data: { type: "package_cleared", package_id: String(pkg.id) },
            });
          } catch (e) { console.error("push fail", e); }
          await logAudit({
            actorId: auth.userId,
            action: "package.cleared",
            resourceType: "package",
            resourceId: String(pkg.id),
            metadata: { signer: body.signer_name, payment_method: releaseMethod, amount: amountPaid },
            request,
          });

          return apiJson({ ok: true, signature: sig, event: ev }, 201);
            },
          });
        } catch (e) { return serverError(e); }
      },
    },
  },
});
