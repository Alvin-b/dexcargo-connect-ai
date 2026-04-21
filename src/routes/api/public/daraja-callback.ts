import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "@/server/evolution";

// Configure your Safaricom Daraja STK callback to point here:
//   https://<your-domain>/api/public/daraja-callback
export const Route = createFileRoute("/api/public/daraja-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        const { data: pay } = await sb.from("payments").update({
          status,
          mpesa_receipt: receipt ?? null,
          raw_callback: body,
        }).eq("checkout_request_id", checkoutId).select("phone, package_id, amount").maybeSingle();

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