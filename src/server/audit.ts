import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function logAudit(opts: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  request?: Request;
}) {
  try {
    const ip =
      opts.request?.headers.get("cf-connecting-ip") ||
      opts.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const ua = opts.request?.headers.get("user-agent") || null;
    await (supabaseAdmin.from as any)("audit_logs").insert({
      actor_id: opts.actorId ?? null,
      actor_email: opts.actorEmail ?? null,
      action: opts.action,
      resource_type: opts.resourceType ?? null,
      resource_id: opts.resourceId ?? null,
      metadata: opts.metadata ?? null,
      ip_address: ip,
      user_agent: ua,
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}