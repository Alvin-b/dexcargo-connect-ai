import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PkgStatus =
  | "received" | "verified" | "awaiting_payment" | "paid"
  | "ready_for_collection" | "collected" | "cleared" | "cancelled";

export async function transitionStatus(packageId: string, to: PkgStatus, employeeId?: string | null, notes?: string) {
  const { data, error } = await (supabaseAdmin as any).rpc("transition_package_status", {
    _package_id: packageId, _to: to, _employee_id: employeeId ?? null, _notes: notes ?? null,
  });
  if (error) throw error;
  return data;
}

export async function awardCommission(packageId: string, employeeId: string, trigger: "received"|"payment"|"delivery", base = 0, paymentId?: string) {
  const { data } = await (supabaseAdmin as any).rpc("award_commission", {
    _package_id: packageId, _employee_id: employeeId, _trigger: trigger, _base: base, _payment_id: paymentId ?? null,
  });
  return data;
}