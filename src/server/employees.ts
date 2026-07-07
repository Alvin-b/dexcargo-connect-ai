import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EmployeeRow = {
  id: string;
  user_id: string;
  employee_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  branch_id: string | null;
  status: "active" | "suspended";
};

// Resolve the employees row for the currently-authenticated user id.
// Returns null when the auth user is not registered as an employee (e.g. legacy client accounts).
export async function getEmployeeByUserId(userId: string): Promise<EmployeeRow | null> {
  const { data } = await (supabaseAdmin.from("employees") as any)
    .select("id, user_id, employee_code, full_name, email, phone, role, branch_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as EmployeeRow | null) ?? null;
}

export async function requireActiveEmployee(userId: string) {
  const emp = await getEmployeeByUserId(userId);
  if (!emp) throw new Error("employee record not found for this user");
  if (emp.status !== "active") throw new Error("employee account is suspended");
  return emp;
}