import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUsers } from "./push";
import { logAudit } from "./audit";

export async function logAssignmentEvent(opts: {
  conversationId: string;
  eventType:
    | "assigned"
    | "reassigned"
    | "claimed"
    | "unassigned"
    | "ai_disabled"
    | "ai_enabled"
    | "handoff"
    | "escalation";
  actorId?: string | null;
  actorDisplayName?: string | null;
  fromStaffId?: string | null;
  toStaffId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await (supabaseAdmin.from("conversation_assignment_events") as any).insert({
      conversation_id: opts.conversationId,
      event_type: opts.eventType,
      actor_id: opts.actorId ?? null,
      actor_display_name: opts.actorDisplayName ?? null,
      from_staff_id: opts.fromStaffId ?? null,
      to_staff_id: opts.toStaffId ?? null,
      metadata: opts.metadata ?? null,
    });
    await logAudit({
      actorId: opts.actorId ?? null,
      action: `conversation.${opts.eventType}`,
      resourceType: "conversation",
      resourceId: opts.conversationId,
      metadata: {
        from_staff_id: opts.fromStaffId ?? null,
        to_staff_id: opts.toStaffId ?? null,
        ...(opts.metadata ?? {}),
      },
    });
  } catch (e) {
    console.error("logAssignmentEvent failed", e);
  }
}

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

  // Atomic, race-free claim. If another request grabbed the conversation
  // a microsecond earlier, this returns NULL and we abort cleanly.
  const { data: claimed, error } = await (supabaseAdmin.rpc as any)(
    "atomic_claim_conversation",
    { _conversation_id: conversationId, _staff_id: staff.id, _expected_current: null },
  );
  if (error) throw error;
  if (!claimed || claimed !== staff.id) return null;
  const assignedAt = new Date().toISOString();

  await (supabaseAdmin.from("messages") as any).insert({
    conversation_id: conversationId,
    role: "system",
    content: `Assigned to ${staff.display_name ?? "staff member"}.`,
    created_by: staff.id,
    staff_display_name: staff.display_name ?? null,
  });

  await logAssignmentEvent({
    conversationId,
    eventType: "assigned",
    actorId: null, // system auto-assignment
    toStaffId: staff.id,
    actorDisplayName: "system",
    metadata: { strategy: "balanced_round_robin", display_name: staff.display_name },
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

