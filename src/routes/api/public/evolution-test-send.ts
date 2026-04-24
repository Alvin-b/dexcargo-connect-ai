import { createFileRoute } from "@tanstack/react-router";
import { sendWhatsAppText, normalizeNumber } from "@/server/evolution";

export const Route = createFileRoute("/api/public/evolution-test-send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
        if (expected) {
          const url = new URL(request.url);
          const provided =
            request.headers.get("x-webhook-secret") ||
            url.searchParams.get("secret");
          if (provided !== expected) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        let body: { number?: string; text?: string } | null = null;
        try {
          body = await request.json();
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const number = normalizeNumber(body?.number ?? "");
        const text = String(body?.text ?? "Webhook outbound test from Dexcargo").trim();

        if (!number || !text) {
          return new Response("number and text are required", { status: 400 });
        }

        try {
          const result = await sendWhatsAppText(number, text);
          return Response.json({ ok: true, number, result });
        } catch (error: any) {
          return Response.json(
            { ok: false, error: error?.message ?? String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});