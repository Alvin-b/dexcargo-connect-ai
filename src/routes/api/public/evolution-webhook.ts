import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAgent } from "@/server/ai-agent";
import { sendWhatsAppText, normalizeNumber } from "@/server/evolution";

// Evolution API posts events here. Configure webhook in Evolution to:
//   https://<your-domain>/api/public/evolution-webhook?secret=<EVOLUTION_WEBHOOK_SECRET>
// We only act on inbound text messages from real users (not from us).
export const Route = createFileRoute("/api/public/evolution-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Verify shared secret
        const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
        if (expected) {
          const url = new URL(request.url);
          const provided = url.searchParams.get("secret") || request.headers.get("x-webhook-secret");
          if (provided !== expected) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        let payload: any;
        try { payload = await request.json(); } catch { return new Response("bad json", { status: 400 }); }

        // Evolution event shape varies; common: { event, instance, data: { key: { remoteJid, fromMe, id }, message: { conversation | extendedTextMessage: { text } }, pushName } }
        const event = payload.event || payload.type;
        const data = payload.data || payload;
        const key = data?.key || {};
        if (key.fromMe) return new Response("ignored: fromMe", { status: 200 });

        const remoteJid: string | undefined = key.remoteJid || data.remoteJid;
        if (!remoteJid || remoteJid.endsWith("@g.us")) {
          return new Response("ignored", { status: 200 });
        }
        const number = normalizeNumber(remoteJid);

        const text: string =
          data?.message?.conversation ||
          data?.message?.extendedTextMessage?.text ||
          data?.message?.imageMessage?.caption ||
          data?.text ||
          "";

        if (!text || (event && !String(event).toLowerCase().includes("message"))) {
          return new Response("ignored: no text", { status: 200 });
        }

        // Find or create conversation
        const sb = supabaseAdmin;
        let conv;
        {
          const { data: existing } = await sb.from("conversations").select("*").eq("whatsapp_number", number).maybeSingle();
          if (existing) conv = existing;
          else {
            const { data: client } = await sb.from("clients").select("id").eq("whatsapp_number", number).maybeSingle();
            const { data: created } = await sb.from("conversations").insert({
              whatsapp_number: number,
              client_id: client?.id ?? null,
              ai_enabled: true,
            }).select().single();
            conv = created!;
          }
        }

        // Save inbound message
        await sb.from("messages").insert({
          conversation_id: conv.id,
          role: "user",
          content: text,
          evolution_message_id: key.id ?? null,
        });
        await sb.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

        if (!conv.ai_enabled) {
          return new Response("ok: ai disabled", { status: 200 });
        }

        // Build short history
        const { data: hist } = await sb.from("messages")
          .select("role, content")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true })
          .limit(40);
        const history = (hist ?? [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(0, -1) // exclude the just-saved user msg (added below)
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content ?? "" }));

        let reply = "";
        try {
          reply = await runAgent({
            conversationId: conv.id,
            whatsappNumber: number,
            history,
            userMessage: text,
          });
        } catch (e: any) {
          console.error("agent error", e);
          reply = "Sorry, something went wrong. A human agent will get back to you.";
        }

        if (reply?.trim()) {
          await sb.from("messages").insert({
            conversation_id: conv.id,
            role: "assistant",
            content: reply,
          });
          try { await sendWhatsAppText(number, reply); } catch (e) { console.error("send fail", e); }
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});