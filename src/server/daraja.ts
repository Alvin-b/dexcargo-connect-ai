import { supabaseAdmin } from "@/integrations/supabase/client.server";

export class DarajaError extends Error {
  status: number;
  code: string;
  safeMessage: string;
  details?: unknown;

  constructor(code: string, safeMessage: string, status = 502, details?: unknown) {
    super(safeMessage);
    this.name = "DarajaError";
    this.code = code;
    this.safeMessage = safeMessage;
    this.status = status;
    this.details = details;
  }
}

function env(name: string, aliases: string[] = []): string {
  const key = [name, ...aliases].find((item) => process.env[item]);
  const v = key ? process.env[key] : undefined;
  if (!v) throw new Error(`Missing secret: ${[name, ...aliases].join(" or ")}`);
  return v;
}

function darajaBase() {
  const e = (process.env.DARAJA_ENV ?? "production").toLowerCase();
  return e === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

async function getAccessToken(): Promise<string> {
  const key = env("DARAJA_CONSUMER_KEY", ["MPESA_CONSUMER_KEY", "SAFARICOM_CONSUMER_KEY"]);
  const secret = env("DARAJA_CONSUMER_SECRET", ["MPESA_CONSUMER_SECRET", "SAFARICOM_CONSUMER_SECRET"]);
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${darajaBase()}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    });
  } catch (error) {
    throw new DarajaError("DARAJA_NETWORK_ERROR", "M-Pesa service is unreachable. Please try again.", 503, { step: "auth", error: String(error) });
  }
  const raw = await res.text();
  const j = raw ? JSON.parse(raw) : {};
  if (!res.ok) {
    throw new DarajaError("DARAJA_AUTH_FAILED", "M-Pesa configuration could not be authenticated.", 502, {
      status: res.status,
      response: j,
    });
  }
  if (!j.access_token) throw new DarajaError("DARAJA_AUTH_FAILED", "M-Pesa did not return an access token.", 502, j);
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

export function normalizeSafaricomPhone(phone: string): string {
  let p = phone.replace(/\D/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  if (!/^254(7|1)\d{8}$/.test(p)) throw new DarajaError("INVALID_MPESA_PHONE", "Use a valid Safaricom phone number, e.g. 2547XXXXXXXX.", 400);
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
  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new DarajaError("INVALID_AMOUNT", "Payment amount must be greater than zero.", 400);
  const phone = normalizeSafaricomPhone(opts.phone);
  const shortcode = env("DARAJA_SHORTCODE", ["MPESA_SHORTCODE", "DARAJA_BUSINESS_SHORTCODE", "MPESA_BUSINESS_SHORTCODE"]);
  const passkey = env("DARAJA_PASSKEY", ["MPESA_PASSKEY", "SAFARICOM_PASSKEY"]);
  const callbackUrl = process.env.DARAJA_CALLBACK_URL ?? process.env.MPESA_CALLBACK_URL ?? process.env.SAFARICOM_CALLBACK_URL ?? "https://dex-connect-flow.lovable.app/api/public/daraja-callback";
  if (!/^https:\/\//i.test(callbackUrl)) throw new Error("DARAJA_CALLBACK_URL must be a public https URL");
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");
  const token = await getAccessToken();

  const body = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: process.env.DARAJA_TRANSACTION_TYPE ?? process.env.MPESA_TRANSACTION_TYPE ?? "CustomerPayBillOnline",
    Amount: Math.round(amount),
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: opts.accountReference.slice(0, 12),
    TransactionDesc: opts.description.slice(0, 13),
  };

  let res: Response;
  try {
    res = await fetch(`${darajaBase()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new DarajaError("DARAJA_NETWORK_ERROR", "M-Pesa service is unreachable. Please try again.", 503, { step: "stk", error: String(error) });
  }
  const raw = await res.text();
  const j = raw ? JSON.parse(raw) : {};
  if (!res.ok || j.ResponseCode !== "0") {
    throw new DarajaError("STK_PUSH_FAILED", j.errorMessage || j.ResponseDescription || "M-Pesa STK push failed.", res.status >= 400 && res.status < 500 ? 400 : 502, {
      status: res.status,
      response: j,
    });
  }

  const { data: payment, error: paymentErr } = await (supabaseAdmin.from("payments") as any).insert({
    package_id: opts.packageId ?? null,
    client_id: opts.clientId ?? null,
    amount,
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
