import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUsers } from "./push";

type StaffCandidate = {
  id: string;
  display_name: string | null;
  staff_location: string | null;
};

async function listAssignableStaff(): Promise<StaffCandidate[]> {
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "staff", "china_staff", "kenya_staff"] as any);

  // Conversations are ONLY assigned to Kenya-facing customer agents.
  // Admins and china_staff are intentionally excluded from the rotation.
  const excludedIds = new Set(
    (roleRows ?? [])
      .filter((row: any) => row.role === "admin" || row.role === "china_staff")
      .map((row: any) => row.user_id),
  );
  const staffIds = Array.from(new Set(
    (roleRows ?? [])
      .filter((row: any) => (row.role === "staff" || row.role === "kenya_staff") && !excludedIds.has(row.user_id))
      .map((row: any) => row.user_id),
  ));

  if (!staffIds.length) return [];

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, staff_location, is_active")
    .in("id", staffIds);
  if (error) throw error;

  return (profiles ?? [])
    .filter((profile: any) => profile.is_active !== false && profile.staff_location !== "china")
    .map((profile: any) => ({
      id: profile.id,
      display_name: profile.display_name ?? null,
      staff_location: profile.staff_location ?? null,
    }));
}

export async function pickBalancedStaff(): Promise<StaffCandidate | null> {
  const candidates = await listAssignableStaff();
  if (!candidates.length) return null;

  const candidateIds = candidates.map((staff) => staff.id);
  const { data: assignedRows } = await (supabaseAdmin.from("conversations") as any)
    .select("assigned_staff_id")
    .in("assigned_staff_id", candidateIds);

  const counts = new Map(candidateIds.map((id) => [id, 0]));
  for (const row of assignedRows ?? []) {
    if (row.assigned_staff_id) counts.set(row.assigned_staff_id, (counts.get(row.assigned_staff_id) ?? 0) + 1);
  }

  return [...candidates].sort((a, b) => {
    const byLoad = (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0);
    if (byLoad !== 0) return byLoad;
    return (a.display_name ?? a.id).localeCompare(b.display_name ?? b.id);
  })[0] ?? null;
}

export async function assignConversation(conversationId: string, currentAssignedStaffId?: string | null) {
  if (currentAssignedStaffId) return null;
  const staff = await pickBalancedStaff();
  if (!staff) return null;

  const assignedAt = new Date().toISOString();
  const { error } = await (supabaseAdmin.from("conversations") as any)
    .update({
      assigned_staff_id: staff.id,
      assigned_at: assignedAt,
    })
    .eq("id", conversationId);
  if (error) throw error;

  await (supabaseAdmin.from("messages") as any).insert({
    conversation_id: conversationId,
    role: "system",
    content: `Assigned to ${staff.display_name ?? "staff member"}.`,
    created_by: staff.id,
    staff_display_name: staff.display_name ?? null,
  });

  // Notify the assigned agent on their mobile device.
  try {
    const { data: conv } = await (supabaseAdmin.from("conversations") as any)
      .select("whatsapp_number, clients(full_name)")
      .eq("id", conversationId)
      .maybeSingle();
    const who = (conv as any)?.clients?.full_name ?? (conv as any)?.whatsapp_number ?? "a client";
    await sendPushToUsers([staff.id], {
      title: "New client assigned",
      body: `${who} has been assigned to you.`,
      data: { type: "conversation_assigned", conversation_id: conversationId },
    });
  } catch (e) {
    console.error("assignment push failed", e);
  }

  return { ...staff, assigned_at: assignedAt };
}

export async function assignUnassignedConversations(limit = 100) {
  const { data, error } = await (supabaseAdmin.from("conversations") as any)
    .select("id, assigned_staff_id")
    .is("assigned_staff_id", null)
    .order("last_message_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;

  let assigned = 0;
  for (const conversation of data ?? []) {
    const result = await assignConversation(conversation.id, conversation.assigned_staff_id);
    if (result) assigned += 1;
  }
  return assigned;
}

