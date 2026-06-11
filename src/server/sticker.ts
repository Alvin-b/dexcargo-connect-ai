import QRCode from "qrcode";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StickerPayload = {
  tracking_number: string;
  external_barcode: string | null;
  route_code: string | null;
  remark: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  destination_country: string | null;
  destination_city: string | null;
  mode: string | null;
  cargo_type: string | null;
  special_cargo_type: string | null;
  weight_kg: number | null;
  cbm: number | null;
  piece_count: number | null;
  received_at: string | null;
  batch_code: string | null;
  qr_text: string;
  qr_png_data_url: string;
  printed_at: string;
};

/**
 * Build a printable sticker payload for one package. The desktop app renders
 * this on a thermal printer (Zebra / 4x6, 100mm x 150mm typical).
 */
export async function buildStickerForPackage(packageId: string): Promise<StickerPayload | null> {
  const { data: pkg } = await supabaseAdmin
    .from("packages")
    .select("*, clients(full_name, whatsapp_number)")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg) return null;

  // Last batch this package belongs to, if any
  const { data: bp } = await supabaseAdmin
    .from("batch_packages")
    .select("loading_batches(batch_code)")
    .eq("package_id", pkg.id)
    .order("loaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const batchCode = (bp as any)?.loading_batches?.batch_code ?? null;

  const qrText = JSON.stringify(
    pkg.qr_payload && typeof pkg.qr_payload === "object"
      ? pkg.qr_payload
      : { tracking_number: pkg.tracking_number },
  );
  const qrDataUrl = await QRCode.toDataURL(qrText, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  const client = (pkg as any).clients;
  return {
    tracking_number: pkg.tracking_number,
    external_barcode: pkg.external_barcode ?? null,
    route_code: pkg.route_code ?? null,
    remark: pkg.remark ?? null,
    customer_name: client?.full_name ?? pkg.sender_name ?? null,
    customer_phone: client?.whatsapp_number ?? pkg.sender_phone ?? null,
    destination_country: pkg.destination_country ?? null,
    destination_city: pkg.destination_city ?? null,
    mode: pkg.mode ?? null,
    cargo_type: pkg.cargo_type ?? null,
    special_cargo_type: pkg.special_cargo_type ?? null,
    weight_kg: pkg.weight_kg !== null ? Number(pkg.weight_kg) : null,
    cbm: pkg.cbm !== null ? Number(pkg.cbm) : null,
    piece_count: pkg.piece_count ?? null,
    received_at: pkg.received_at ?? null,
    batch_code: batchCode,
    qr_text: qrText,
    qr_png_data_url: qrDataUrl,
    printed_at: new Date().toISOString(),
  };
}