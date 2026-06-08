import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "@/server/evolution";
import { sendPushToAudience } from "@/server/push";
import { logAudit } from "@/server/audit";

// Safaricom Daraja production IP ranges (override via DARAJA_ALLOWED_IPS env, comma-separated).
const DEFAULT_DARAJA_IPS = [
  "196.201.214.0/24",
  "196.201.213.0/24",
  "196.201.212.0/24",
  "196.201.215.0/24",
  "196.201.216.0/24",
  "196.201.217.0/24",
];

function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipNum = ipToInt(ip);
  const baseNum = ipToInt(base);
  if (ipNum === null || baseNum === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

function isAllowedIp(request: Request): boolean {
  const skip = process.env.DARAJA_SKIP_IP_CHECK === "true";
  if (skip) return true;
  const ips = [
    request.headers.get("cf-connecting-ip"),
    ...(request.headers.get("x-forwarded-for")?.split(",") ?? []),
  ].map((ip) => ip?.trim()).filter(Boolean) as string[];
  if (!ips.length) return true;
  const allow = (process.env.DARAJA_ALLOWED_IPS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_DARAJA_IPS);
  return ips.some((ip) => allow.some((c) => ipInCidr(ip, c)));
}

// Configure your Safaricom Daraja STK callback to point here:
//   https://<your-domain>/api/public/daraja-callback
export const Route = createFileRoute("/api/public/daraja-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAllowedIp(request)) {
          await logAudit({
            action: "daraja.callback.rejected_ip",
            metadata: { reason: "ip not in allowlist" },
            request,
          });
          return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: "Forbidden" }), { status: 403 });
        }
        let body: any;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), { status: 200 });
        }
        const stk = body?.Body?.stkCallback;
        if (!stk) return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), { status: 200 });

        const checkoutId: string = stk.CheckoutRequestID;
        const resultCode: number = stk.ResultCode;
        const items: any[] = stk.CallbackMetadata?.Item ?? [];
        const get = (n: string) => items.find((i) => i.Name === n)?.Value;
        const receipt = get("MpesaReceiptNumber");
        const amount = get("Amount");

        const sb = supabaseAdmin;
        const status = resultCode === 0 ? "success" : (resultCode === 1032 ? "cancelled" : "failed");

        // Idempotency: if this receipt is already recorded as success, ack and exit.
        if (status === "success" && receipt) {
          const { data: existing } = await sb
            .from("payments")
            .select("id, status")
            .eq("mpesa_receipt", receipt)
            .maybeSingle();
          if (existing && existing.status === "success") {
            return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted (duplicate)" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        const { data: existingPay } = await (sb.from("payments") as any)
          .select("raw_callback")
          .eq("checkout_request_id", checkoutId)
          .maybeSingle();
        const previousRaw = existingPay?.raw_callback && typeof existingPay.raw_callback === "object"
          ? existingPay.raw_callback
          : {};

        const { data: pay } = await (sb.from("payments") as any).update({
          status,
          mpesa_receipt: receipt ?? null,
          raw_callback: {
            ...previousRaw,
            callback: body,
            daraja_result: { code: resultCode, description: stk.ResultDesc ?? null },
          },
          verified_at: status === "success" ? new Date().toISOString() : null,
        }).eq("checkout_request_id", checkoutId).select("phone, package_id, amount").maybeSingle();

        if (pay?.package_id) {
          if (status === "success") {
            await (sb.from("packages") as any).update({
              payment_status: "paid",
              payment_method: "mpesa",
            }).eq("id", pay.package_id);
            await (sb.from("package_events") as any).insert({
              package_id: pay.package_id,
              status: "arrived_destination",
              notes: `M-Pesa payment verified${receipt ? ` (${receipt})` : ""}. Package is paid and waiting for customer signature.`,
            });
            // Notify Kenya staff so they can release the parcel
            try {
              await sendPushToAudience("kenya", {
                title: "Payment received",
                body: `KES ${amount} paid${receipt ? ` (${receipt})` : ""}. Capture signature to clear the package.`,
                data: { type: "payment_success", package_id: String(pay.package_id) },
              });
            } catch (e) { console.error("push notify fail", e); }
          } else {
            await (sb.from("packages") as any).update({
              payment_status: status,
              payment_method: "mpesa",
            }).eq("id", pay.package_id);
          }
        }

        await logAudit({
          action: `daraja.callback.${status}`,
          resourceType: "payment",
          resourceId: pay?.package_id ? String(pay.package_id) : checkoutId,
          metadata: { receipt, amount, resultCode, resultDesc: stk.ResultDesc ?? null, checkoutId },
          request,
        });

        if (pay) {
          let msg = "";
          if (status === "success") msg = `Payment received. M-Pesa receipt: ${receipt}. Amount: KES ${amount}. Asante!`;
          else if (status === "cancelled") msg = "You cancelled the M-Pesa payment. Reply PAY to try again.";
          else msg = `Payment failed: ${stk.ResultDesc}. Reply PAY to try again.`;
          try { await sendWhatsAppText(pay.phone, msg); } catch (e) { console.error("notify fail", e); }
        }

        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
