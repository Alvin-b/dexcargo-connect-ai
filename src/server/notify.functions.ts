import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText, sendWhatsAppImage } from "@/server/evolution";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  received_in_china: "Received at our China warehouse",
  processing: "Processing for shipment",
  in_transit: "In transit",
  arrived_destination: "Arrived in destination country",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

// Update package status, log event, and notify the client over WhatsApp.
export const updatePackageStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { packageId: string; status: string; location?: string; notes?: string; photoUrl?: string }) => d)
  .handler(async ({ data }) => {
    const sb = supabaseAdmin;
    const { data: pkg, error } = await sb.from("packages").update({
      status: data.status as any,
      ...(data.status === "received_in_china" ? { received_at: new Date().toISOString() } : {}),
      ...(data.status === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
      ...(data.photoUrl && data.status === "received_in_china" ? { warehouse_photo_url: data.photoUrl } : {}),
    }).eq("id", data.packageId).select("*, clients(full_name, whatsapp_number)").single();
    if (error || !pkg) throw new Error(error?.message || "Package not found");

    await sb.from("package_events").insert({
      package_id: pkg.id,
      status: data.status as any,
      location: data.location ?? null,
      notes: data.notes ?? null,
      photo_url: data.photoUrl ?? null,
    });

    const client = (pkg as any).clients;
    if (client?.whatsapp_number) {
      const label = STATUS_LABELS[data.status] ?? data.status;
      const text = `Hi ${client.full_name}, update on package ${pkg.tracking_number}:\n\n📦 ${label}${data.location ? `\n📍 ${data.location}` : ""}${data.notes ? `\n${data.notes}` : ""}\n\nReply TRACK ${pkg.tracking_number} for full details.`;
      try {
        if (data.photoUrl) await sendWhatsAppImage(client.whatsapp_number, data.photoUrl, text);
        else await sendWhatsAppText(client.whatsapp_number, text);
        await sb.from("package_events").update({ notified_client: true })
          .eq("package_id", pkg.id)
          .eq("status", data.status as any)
          .order("created_at", { ascending: false })
          .limit(1);
      } catch (e) {
        console.error("WhatsApp notify failed", e);
      }
    }
    return { ok: true };
  });

export const generateMarketingPost = createServerFn({ method: "POST" })
  .inputValidator((d: { platform: "facebook"|"instagram"|"tiktok"|"x"; topic: string }) => d)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const platformGuide: Record<string, string> = {
      facebook: "300-500 chars, friendly, include a clear CTA, 3-5 hashtags.",
      instagram: "200-400 chars, vivid, emoji-rich, 8-12 hashtags at the end.",
      tiktok: "Short hook (under 150 chars), trendy tone, 5-8 hashtags.",
      x: "Under 270 chars, punchy, max 3 hashtags.",
    };
    const sys = `You are the Dexcargo social media marketing AI. Dexcargo ships cargo from China to clients worldwide (focus Kenya). Write a single ${data.platform.toUpperCase()} post about: ${data.topic}. Style: ${platformGuide[data.platform]}. Output JSON only with keys: content, hashtags.`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: data.topic }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Rate limited, try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace settings.");
      throw new Error(`AI error: ${res.status}`);
    }
    const j = await res.json();
    let parsed: any = {};
    try { parsed = JSON.parse(j.choices?.[0]?.message?.content || "{}"); } catch {}
    const sb = supabaseAdmin;
    const { data: post } = await sb.from("marketing_posts").insert({
      platform: data.platform,
      content: parsed.content || j.choices?.[0]?.message?.content || "",
      hashtags: parsed.hashtags || null,
      status: "draft",
    }).select().single();
    return { post };
  });

// Initiate STK push from the admin UI for a specific package
export const adminInitiatePayment = createServerFn({ method: "POST" })
  .inputValidator((d: { packageId: string; phone: string; amount: number }) => d)
  .handler(async ({ data }) => {
    const { initiateStkPush } = await import("./daraja");
    const sb = supabaseAdmin;
    const { data: pkg } = await sb.from("packages").select("tracking_number, client_id").eq("id", data.packageId).maybeSingle();
    if (!pkg) throw new Error("Package not found");
    const r = await initiateStkPush({
      phone: data.phone,
      amount: data.amount,
      accountReference: pkg.tracking_number,
      description: `Dexcargo ${pkg.tracking_number}`,
      packageId: data.packageId,
      clientId: pkg.client_id,
    });
    return { ok: true, checkoutRequestId: r.CheckoutRequestID };
  });