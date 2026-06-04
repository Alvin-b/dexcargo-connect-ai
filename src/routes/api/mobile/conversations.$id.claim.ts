import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, badRequest, notFound, serverError } from "@/server/api-auth";
import { logAssignmentEvent } from "@/server/conversation-assignment";

// POST /api/mobile/conversations/:id/claim
// Atomic, race-safe ownership claim. Only one staff can win.
// Body (optional): { force: true } — admin only, reassigns from current owner.
export const Route = createFileRoute("/api/mobile/conversations/$id/claim")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;

          let force = false;
          try {
            const body = await request.json();
            force = !!body?.force;
          } catch { /* no body is fine */ }

          const { data: current, error: readErr } = await (supabaseAdmin.from("conversations") as any)
            .select("id, assigned_staff_id, ai_enabled")
            .eq("id", params.id)
            .maybeSingle();
          if (readErr) throw readErr;
          if (!current) return notFound("conversation not found");

          if (current.assigned_staff_id && current.assigned_staff_id !== auth.userId) {
            if (!auth.isAdmin && !force) {
              return apiJson(
                { error: "conversation already assigned", assigned_staff_id: current.assigned_staff_id },
                409,
              );
            }
            if (!auth.isAdmin && force) return badRequest("only admin can force-claim");
          }

          // Atomic CAS update: only succeeds if the row still matches expected current owner.
          const expected = current.assigned_staff_id ?? null;
          const { data: claimedId, error: rpcErr } = await (supabaseAdmin.rpc as any)(
            "atomic_claim_conversation",
            { _conversation_id: params.id, _staff_id: auth.userId, _expected_current: expected },
          );
          if (rpcErr) throw rpcErr;
          if (!claimedId || claimedId !== auth.userId) {
            return apiJson({ error: "claim race lost — conversation just got reassigned" }, 409);
          }

          const { data: profile } = await supabaseAdmin
            .from("profiles").select("display_name").eq("id", auth.userId).maybeSingle();

          await logAssignmentEvent({
            conversationId: params.id,
            eventType: expected ? "reassigned" : "claimed",
            actorId: auth.userId,
            actorDisplayName: profile?.display_name ?? null,
            fromStaffId: expected,
            toStaffId: auth.userId,
            metadata: { force, via: "mobile_claim" },
          });

          await (supabaseAdmin.from("messages") as any).insert({
            conversation_id: params.id,
            role: "system",
            content: expected
              ? `Reassigned to ${profile?.display_name ?? "staff member"}.`
              : `Claimed by ${profile?.display_name ?? "staff member"}.`,
            created_by: auth.userId,
            staff_display_name: profile?.display_name ?? null,
          });

          return apiJson({ ok: true, assigned_staff_id: auth.userId });
        } catch (e) { return serverError(e); }
      },
    },
  },
});