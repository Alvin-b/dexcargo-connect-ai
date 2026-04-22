import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type QuoteInput = {
  destinationCountry: string;
  mode: "air" | "sea" | "express";
  category?: string;
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
// For air/express we charge per kg (use weight). For sea we charge per CBM (use volume).
export async function computeQuote(input: QuoteInput): Promise<QuoteResult> {
  const sb = supabaseAdmin;
  let q = sb.from("rates").select("*").eq("active", true)
    .ilike("destination_country", `%${input.destinationCountry}%`)
    .eq("mode", input.mode);
  if (input.category) q = q.ilike("category", `%${input.category}%`);
  const { data: rates } = await q;
  // Pick the most specific rate (category match preferred)
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

  const isSea = input.mode === "sea";
  const unit: "kg" | "cbm" = isSea ? "cbm" : "kg";
  const chargeable = isSea ? Number(input.cbm || 0) : Number(input.weightKg || 0);
  const unitPrice = isSea ? Number(rate.price_per_cbm || 0) : Number(rate.price_per_kg || 0);
  let cost = chargeable * unitPrice;
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
    message: `${chargeable} ${unit} × ${unitPrice} ${rate.currency}/${unit} = ${Math.round(cost)} ${rate.currency}${appliedMin ? " (min charge applied)" : ""}`,
  };
}