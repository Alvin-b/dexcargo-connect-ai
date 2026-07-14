import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { TextRecognition, Script } from "@capacitor-mlkit/text-recognition";
import { BarcodeScanner, BarcodeFormat } from "@capacitor-mlkit/barcode-scanning";

export type OcrDraft = {
  rawText: string;
  trackingNumber: string;
  customerPhone: string;
  weightKg: string;
  pieces: string;
  supplier: string;
  description: string;
  imagePath?: string;
  imageWebPath?: string;
};

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

export function parseCargoStickerText(rawText: string): OcrDraft {
  const clean = rawText.replace(/\r/g, "\n");
  const trackingNumber = firstMatch(clean, [
    /(?:tracking|waybill|awb|barcode|no\.?)\s*[:#-]?\s*([A-Z0-9-]{8,})/i,
    /\b([A-Z]{1,4}\d{8,18}[A-Z0-9-]*)\b/i,
    /\b(\d{10,18})\b/,
  ]);
  const customerPhone = firstMatch(clean, [
    /(?:phone|tel|mobile|whatsapp)\s*[:#-]?\s*(\+?\d[\d\s-]{7,})/i,
    /\b(\+?254\d{9}|0\d{9})\b/,
  ]).replace(/\s+/g, "");
  const weightKg = firstMatch(clean, [
    /(?:weight|wt|kg)\s*[:#-]?\s*(\d+(?:\.\d+)?)\s*kg/i,
    /\b(\d+(?:\.\d+)?)\s*kg\b/i,
  ]);
  const pieces = firstMatch(clean, [
    /(?:pcs|pieces|qty|quantity)\s*[:#-]?\s*(\d+)/i,
  ]);
  const supplier = firstMatch(clean, [
    /(?:supplier|shipper|sender)\s*[:#-]?\s*([^\n]+)/i,
  ]);
  const description = firstMatch(clean, [
    /(?:description|goods|item|cargo)\s*[:#-]?\s*([^\n]+)/i,
  ]);

  return { rawText, trackingNumber, customerPhone, weightKg, pieces, supplier, description };
}

export async function captureAndRecognizeSticker(): Promise<OcrDraft> {
  const photo = await Camera.getPhoto({
    quality: 92,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    width: 1800,
    correctOrientation: true,
  });

  if (!Capacitor.isNativePlatform() || !photo.path) {
    return {
      ...parseCargoStickerText(""),
      imagePath: photo.path,
      imageWebPath: photo.webPath,
    };
  }

  const result = await TextRecognition.processImage({ path: photo.path, script: Script.Latin });
  return {
    ...parseCargoStickerText(result.text),
    imagePath: photo.path,
    imageWebPath: photo.webPath,
  };
}

export async function scanBarcodeValue() {
  const permission = await BarcodeScanner.requestPermissions();
  if (permission.camera !== "granted" && permission.camera !== "limited") {
    throw new Error("Camera permission is required for barcode scanning.");
  }
  const result = await BarcodeScanner.scan({
    formats: [BarcodeFormat.Code128, BarcodeFormat.Code39, BarcodeFormat.Ean13, BarcodeFormat.QrCode],
    autoZoom: true,
  });
  return result.barcodes[0]?.rawValue ?? result.barcodes[0]?.displayValue ?? "";
}
