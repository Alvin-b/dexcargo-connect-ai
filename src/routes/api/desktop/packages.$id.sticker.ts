import { createFileRoute } from "@tanstack/react-router";
import { authenticate, apiJson, preflight, notFound, serverError } from "@/server/api-auth";
import { buildStickerForPackage } from "@/server/sticker";

// GET /api/desktop/packages/:id/sticker
// Returns a printable sticker payload (label fields + QR PNG data URL) for the
// China desktop app to send to a thermal printer.
export const Route = createFileRoute("/api/desktop/packages/$id/sticker")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request, { location: "china" });
          if (!auth.ok) return auth.response;
          const sticker = await buildStickerForPackage(params.id);
          if (!sticker) return notFound("package not found");
          return apiJson({ sticker });
        } catch (e) { return serverError(e); }
      },
    },
  },
});