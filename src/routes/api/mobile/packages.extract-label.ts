import { createFileRoute } from "@tanstack/react-router";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

// POST /api/mobile/packages/extract-label
// Body: { image_url: string } OR { image_base64: string, mime?: string }
// Returns: { ok, extracted: { tracking_number, route_code, ... }, raw }
//
// Uses Lovable AI (Gemini 2.5 Flash with vision) to OCR a Dex Cargo / AFA-style
// shipping label and return structured JSON the mobile app can pass into
// POST /api/mobile/packages/scan to register the package.
export const Route = createFileRoute("/api/mobile/packages/extract-label")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.image_url && !body?.image_base64) {
            return badRequest("image_url or image_base64 required");
          }

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) return apiJson({ error: "LOVABLE_API_KEY not configured" }, 500);

          const imageContent = body.image_url
            ? { type: "image_url", image_url: { url: body.image_url } }
            : {
                type: "image_url",
                image_url: { url: `data:${body.mime ?? "image/jpeg"};base64,${body.image_base64}` },
              };

          const prompt = `You are reading a Dex Cargo / AFA shipping label printed on a box (China → Kenya / HK → NBO route).
Extract every field you can read and return JSON ONLY. Use null when a field is missing or illegible. Numbers must be numbers, not strings.
Schema:
{
  "tracking_number": string|null,        // the long barcode number, e.g. "1251229809615"
  "external_barcode": string|null,        // same as tracking_number if only one is visible
  "route_code": string|null,              // e.g. "HKG-NBO"
  "shipper_name": string|null,
  "shipper_company": string|null,
  "shipper_phone": string|null,
  "shipper_address": string|null,
  "consignee_name": string|null,          // e.g. "alvine ojiambo" — goes to sender_name on the package row
  "consignee_company": string|null,
  "consignee_phone": string|null,
  "consignee_address": string|null,
  "category": string|null,                // "Nature of the goods"
  "weight_kg": number|null,               // "Total Weight (kg)"
  "cbm": number|null,                     // "Total Volume"
  "piece_count": number|null,             // "PCS"
  "chargeable_weight_kg": number|null,    // "Total Chargeable Weight"
  "payment_type": string|null,            // "PP", "CC", etc.
  "declared_amount": number|null,
  "declared_currency": string|null,       // "USD" / "RMB" / "KES"
  "insurance_charge": number|null,
  "other_charge": number|null,
  "freight_charge": number|null,
  "origin_total_charge": number|null,     // "Total Charge" in origin currency
  "origin_currency": string|null,         // usually "RMB"
  "remark": string|null                   // internal reference, e.g. "YT2578443091712"
}
Return ONLY the JSON object, no markdown, no commentary.`;

          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [{ type: "text", text: prompt }, imageContent],
                },
              ],
            }),
          });

          if (!aiRes.ok) {
            const txt = await aiRes.text();
            if (aiRes.status === 429) return apiJson({ error: "AI rate limit hit, try again shortly" }, 429);
            if (aiRes.status === 402) return apiJson({ error: "Lovable AI credits exhausted" }, 402);
            return apiJson({ error: `AI gateway error: ${txt.slice(0, 300)}` }, 502);
          }

          const aiJson: any = await aiRes.json();
          const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) return apiJson({ error: "AI did not return JSON", raw: content }, 422);

          let extracted: any;
          try { extracted = JSON.parse(jsonMatch[0]); }
          catch { return apiJson({ error: "AI returned malformed JSON", raw: content }, 422); }

          // Normalize a couple of friendly aliases the scan endpoint expects.
          if (extracted.consignee_name && !extracted.sender_name) extracted.sender_name = extracted.consignee_name;
          if (extracted.consignee_phone && !extracted.sender_phone) extracted.sender_phone = extracted.consignee_phone;

          return apiJson({ ok: true, extracted });
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
