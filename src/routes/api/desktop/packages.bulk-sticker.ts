import { createFileRoute } from "@tanstack/react-router";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";
import { buildStickerForPackage } from "@/server/sticker";

// POST /api/desktop/packages/bulk-sticker  { package_ids: string[] }
// Returns sticker payloads for multiple packages so the desktop app can print
// a whole batch in one go. Capped at 100 IDs per call.
export const Route = createFileRoute("/api/desktop/packages/bulk-sticker")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request, { location: "china" });
          if (!auth.ok) return auth.response;
          const body = await readJson<{ package_ids?: string[] }>(request);
          const ids = Array.isArray(body?.package_ids) ? body!.package_ids.filter((s) => typeof s === "string") : [];
          if (ids.length === 0) return badRequest("package_ids required");
          if (ids.length > 100) return badRequest("max 100 package_ids per request");

          const stickers = await Promise.all(ids.map((id) => buildStickerForPackage(id)));
          const found = stickers.filter((s): s is NonNullable<typeof s> => s !== null);
          const missing = ids.filter((_, i) => stickers[i] === null);
          return apiJson({ stickers: found, missing });
        } catch (e) { return serverError(e); }
      },
    },
  },
});