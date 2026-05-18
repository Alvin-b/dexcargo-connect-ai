import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function normalizeClientPhone(input: unknown) {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (/^0(7|1)\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^(7|1)\d{8}$/.test(digits)) return `254${digits}`;
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

export function clientNameFromPayload(payload: any) {
  return String(
    payload?.customer_name ??
    payload?.sender_name ??
    payload?.full_name ??
    payload?.name ??
    "",
  ).trim();
}

export function clientPhoneFromPayload(payload: any) {
  return normalizeClientPhone(
    payload?.customer_phone ??
    payload?.sender_phone ??
    payload?.whatsapp_number ??
    payload?.phone,
  );
}

export async function resolvePackageClient(payload: any) {
  if (payload?.client_id) return payload.client_id as string;

  const whatsappNumber = clientPhoneFromPayload(payload);
  if (!whatsappNumber) return null;

  const fullName = clientNameFromPayload(payload) || "DEX Cargo Client";
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, email, country, city, address, notes")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (clientNameFromPayload(payload) && existing.full_name !== fullName) patch.full_name = fullName;
    if (payload.email && existing.email !== payload.email) patch.email = payload.email;
    if (payload.country && existing.country !== payload.country) patch.country = payload.country;
    if (payload.city && existing.city !== payload.city) patch.city = payload.city;
    if (payload.address && existing.address !== payload.address) patch.address = payload.address;
    if (Object.keys(patch).length) {
      await (supabaseAdmin.from("clients") as any).update(patch).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error: createErr } = await supabaseAdmin
    .from("clients")
    .insert({
      full_name: fullName,
      whatsapp_number: whatsappNumber,
      email: payload.email ?? null,
      country: payload.country ?? null,
      city: payload.city ?? null,
      address: payload.address ?? null,
      notes: payload.notes ?? null,
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  return created.id;
}
