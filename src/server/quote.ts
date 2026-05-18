import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type QuoteInput = {
  destinationCountry: string;
  mode: "air" | "sea" | "express" | "special";
  category?: string;
  cargoType?: "general" | "special";
  specialCargoType?: string;
  weightKg?: number;
  cbm?: number;
};

export type QuoteResult = {
  ok: boolean;
  rate?: any;
  chargeable: number;
  unit: "kg" | "cbm";
  cost: number;
  currency: string;
  appliedMin: boolean;
  message: string;
};

// Compute a shipping quote from the rates table.
// For air, express, and special cargo we charge per kg by default. Sea charges per CBM.
export async function computeQuote(input: QuoteInput): Promise<QuoteResult> {
  const sb = supabaseAdmin;
  let q = (sb.from("rates") as any).select("*").eq("active", true)
    .ilike("destination_country", `%${input.destinationCountry}%`)
    .eq("mode", input.mode);
  if (input.category) q = q.ilike("category", `%${input.category}%`);
  if (input.cargoType) q = q.eq("cargo_type", input.cargoType);
  if (input.specialCargoType) q = q.eq("special_cargo_type", input.specialCargoType);

  const { data: rates } = await q;
  const rate = (rates ?? []).sort((a: any, b: any) => {
    const aSpec = (input.category && a.category?.toLowerCase() === input.category.toLowerCase()) ? 0 : 1;
    const bSpec = (input.category && b.category?.toLowerCase() === input.category.toLowerCase()) ? 0 : 1;
    return aSpec - bSpec;
  })[0];

  if (!rate) {
    return {
      ok: false,
      chargeable: 0,
      unit: input.mode === "sea" ? "cbm" : "kg",
      cost: 0,
      currency: "KES",
      appliedMin: false,
      message: `No active rate found for ${input.destinationCountry} (${input.mode}). Please contact support.`,
    };
  }

  const unit: "kg" | "cbm" = (rate.billing_unit ?? (input.mode === "sea" ? "cbm" : "kg")) === "cbm" ? "cbm" : "kg";
  const chargeable = unit === "cbm" ? Number(input.cbm || 0) : Number(input.weightKg || 0);
  if (chargeable <= 0) {
    return {
      ok: false,
      rate,
      chargeable,
      unit,
      cost: 0,
      currency: rate.currency || "KES",
      appliedMin: false,
      message: `Enter a valid ${unit === "cbm" ? "CBM" : "weight"} to calculate this quote.`,
    };
  }

  const unitPrice = unit === "cbm" ? Number(rate.price_per_cbm || 0) : Number(rate.price_per_kg || 0);
  let cost = chargeable * unitPrice + Number(rate.special_handling_fee ?? 0);
  let appliedMin = false;
  if (rate.min_charge && cost < Number(rate.min_charge)) {
    cost = Number(rate.min_charge);
    appliedMin = true;
  }

  return {
    ok: true,
    rate,
    chargeable,
    unit,
    cost: Math.round(cost),
    currency: rate.currency || "KES",
    appliedMin,
    message: `${chargeable} ${unit} x ${unitPrice} ${rate.currency}/${unit} = ${Math.round(cost)} ${rate.currency}${appliedMin ? " (min charge applied)" : ""}`,
  };
}
