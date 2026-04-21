// Evolution API client (server-only). Sends WhatsApp messages.
const URL_BASE = () => process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
const KEY = () => process.env.EVOLUTION_API_KEY;
const INSTANCE = () => process.env.EVOLUTION_INSTANCE;

function ensureConfig() {
  if (!URL_BASE() || !KEY() || !INSTANCE()) {
    throw new Error("Evolution API not configured (EVOLUTION_API_URL/KEY/INSTANCE)");
  }
}

export async function sendWhatsAppText(number: string, text: string) {
  ensureConfig();
  const url = `${URL_BASE()}/message/sendText/${INSTANCE()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY()! },
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Evolution sendText failed ${res.status}: ${t}`);
  }
  return res.json().catch(() => ({}));
}

export async function sendWhatsAppImage(number: string, imageUrl: string, caption = "") {
  ensureConfig();
  const url = `${URL_BASE()}/message/sendMedia/${INSTANCE()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY()! },
    body: JSON.stringify({ number, mediatype: "image", media: imageUrl, caption }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Evolution sendMedia failed ${res.status}: ${t}`);
  }
  return res.json().catch(() => ({}));
}

// Normalize a JID like "2547xxxxxxxx@s.whatsapp.net" -> "2547xxxxxxxx"
export function normalizeNumber(input: string): string {
  if (!input) return input;
  return input.split("@")[0].replace(/\D/g, "");
}