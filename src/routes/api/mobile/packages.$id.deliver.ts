import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, notFound, serverError } from "@/server/api-auth";

// Deliver a package: store digital signature, mark delivered, optionally record cash payment.
// Body: {
//   signer_name (required),
//   signature_data_url (required) — "data:image/png;base64,...." captured on the app,
//   signer_phone?, payment_method? ("cash"|"mpesa"|"other"), amount_paid?,
//   payment_id? (link to existing payments row), notes?
// }
export const Route = createFileRoute("/api/mobile/packages/$id/deliver")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.signer_name) return badRequest("signer_name required");
          if (!body?.signature_data_url) return badRequest("signature_data_url required");

          const { data: pkg } = await supabaseAdmin.from("packages")
            .select("id, tracking_number, client_id, clients(full_name, whatsapp_number)")
            .eq("id", params.id).maybeSingle();
          if (!pkg) return notFound("package not found");

          // Decode the signature data URL and upload to the private "signatures" bucket
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

          // Persist signature row
          const { data: sig, error: sigErr } = await supabaseAdmin.from("delivery_signatures").insert({
            package_id: pkg.id,
            signer_name: body.signer_name,
            signer_phone: body.signer_phone ?? null,
            signature_url: signatureUrl,
            payment_method: body.payment_method ?? "cash",
            amount_paid: body.amount_paid ?? null,
            currency: body.currency ?? "KES",
            payment_id: body.payment_id ?? null,
            notes: body.notes ?? null,
            recorded_by: auth.userId,
          }).select().single();
          if (sigErr) throw sigErr;

          // Mark package delivered
          const deliveredAt = new Date().toISOString();
          await supabaseAdmin.from("packages").update({ status: "delivered", delivered_at: deliveredAt }).eq("id", pkg.id);
          const { data: ev } = await supabaseAdmin.from("package_events").insert({
            package_id: pkg.id,
            status: "delivered",
            notes: `Delivered to ${body.signer_name}${body.payment_method ? ` (paid via ${body.payment_method})` : ""}`,
            created_by: auth.userId,
          }).select().single();

          // Optional WhatsApp confirmation
          const client = (pkg as any).clients;
          if (client?.whatsapp_number) {
            try {
              const { sendWhatsAppText } = await import("@/server/evolution");
              await sendWhatsAppText(
                client.whatsapp_number,
                `✅ Package ${pkg.tracking_number} delivered to ${body.signer_name}. Thank you for shipping with Dexcargo!`
              );
            } catch (e) { console.error("deliver notify failed", e); }
          }

          return apiJson({ ok: true, signature: sig, event: ev }, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});