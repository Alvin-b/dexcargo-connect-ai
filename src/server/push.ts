import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Sends a push notification via Firebase Cloud Messaging (FCM Legacy HTTP).
// Requires FCM_SERVER_KEY secret. For APNs-only devices, register an FCM iOS
// app and use the FCM token — FCM routes to APNs transparently.
export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

async function sendOne(token: string, payload: PushPayload): Promise<{ ok: boolean; error?: string }> {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) return { ok: false, error: "FCM_SERVER_KEY not configured" };
  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${serverKey}`,
      },
      body: JSON.stringify({
        to: token,
        notification: { title: payload.title, body: payload.body, sound: "default" },
        data: payload.data ?? {},
        priority: "high",
      }),
    });
    if (!res.ok) return { ok: false, error: `fcm ${res.status}` };
    const j: any = await res.json().catch(() => ({}));
    if (j?.failure > 0) {
      const err = j?.results?.[0]?.error;
      if (err === "NotRegistered" || err === "InvalidRegistration") {
        await supabaseAdmin.from("push_tokens").delete().eq("token", token);
      }
      return { ok: false, error: err ?? "fcm failure" };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "fcm error" };
  }
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return { sent: 0, failed: 0 };
  const { data: tokens } = await supabaseAdmin
    .from("push_tokens")
    .select("token, user_id")
    .in("user_id", userIds);
  if (!tokens || tokens.length === 0) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  await Promise.all(
    tokens.map(async (t: any) => {
      const r = await sendOne(t.token, payload);
      if (r.ok) sent++; else failed++;
    }),
  );
  return { sent, failed };
}

// Fan out to all staff, optionally scoped to a specific role.
export async function sendPushToAudience(
  audience: "all" | "admin" | "sales_manager" | "logistics_manager" | "sales_rep",
  payload: PushPayload,
) {
  const roles =
    audience === "all"
      ? (["admin", "sales_manager", "logistics_manager", "sales_rep"] as const)
      : ([audience] as const);
  const { data: staffRoles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", roles as any);
  const staffIds = Array.from(new Set((staffRoles ?? []).map((r: any) => r.user_id)));
  if (staffIds.length === 0) return { sent: 0, failed: 0 };
  return sendPushToUsers(staffIds, payload);
}