import { supabaseAdmin } from "@/integrations/supabase/client.server";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing secret: ${name}`);
  return v;
}

function darajaBase() {
  const e = (process.env.DARAJA_ENV ?? "sandbox").toLowerCase();
  return e === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

async function getAccessToken(): Promise<string> {
  const key = env("DARAJA_CONSUMER_KEY");
  const secret = env("DARAJA_CONSUMER_SECRET");
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${darajaBase()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Daraja auth failed: ${res.status}`);
  const j = await res.json();
  return j.access_token;
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

function normalizePhone(phone: string): string {
  let p = phone.replace(/\D/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  return p;
}

export async function initiateStkPush(opts: {
  phone: string;
  amount: number;
  accountReference: string;
  description: string;
  packageId?: string;
  clientId?: string;
  initiatedBy?: string;
  purpose?: "package_clearance" | "deposit" | "adjustment";
}): Promise<{ CheckoutRequestID: string; MerchantRequestID: string; ResponseCode: string; ResponseDescription: string; payment?: any }> {
  const shortcode = env("DARAJA_SHORTCODE");
  const passkey = env("DARAJA_PASSKEY");
  const callbackUrl = env("DARAJA_CALLBACK_URL");
  if (!/^https:\/\//i.test(callbackUrl)) throw new Error("DARAJA_CALLBACK_URL must be a public https URL");
  if (!opts.amount || Number(opts.amount) <= 0) throw new Error("Payment amount must be greater than zero");
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");
  const phone = normalizePhone(opts.phone);
  if (!/^254(7|1)\d{8}$/.test(phone)) throw new Error("Use a valid Safaricom phone number, e.g. 2547XXXXXXXX");
  const token = await getAccessToken();

  const body = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.max(1, Math.round(opts.amount)),
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: opts.accountReference.slice(0, 12),
    TransactionDesc: opts.description.slice(0, 13),
  };

  const res = await fetch(`${darajaBase()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok || j.ResponseCode !== "0") {
    throw new Error(`STK push failed: ${j.errorMessage || j.ResponseDescription || res.status}`);
  }

  const { data: payment, error: paymentErr } = await (supabaseAdmin.from("payments") as any).insert({
    package_id: opts.packageId ?? null,
    client_id: opts.clientId ?? null,
    amount: opts.amount,
    phone,
    checkout_request_id: j.CheckoutRequestID,
    merchant_request_id: j.MerchantRequestID,
    status: "pending",
    purpose: opts.purpose ?? "package_clearance",
    initiated_by: opts.initiatedBy ?? null,
    raw_callback: { stk_request: j },
  }).select().single();
  if (paymentErr) throw paymentErr;

  return { ...j, payment };
}
