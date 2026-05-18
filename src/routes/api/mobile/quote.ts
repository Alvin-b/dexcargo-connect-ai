import { createFileRoute } from "@tanstack/react-router";
import { computeQuote } from "@/server/quote";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/quote")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          if (!body?.destination_country || !body?.mode) return badRequest("destination_country and mode required");
          const result = await computeQuote({
            destinationCountry: body.destination_country,
            mode: body.mode,
            category: body.category,
            cargoType: body.cargo_type,
            specialCargoType: body.special_cargo_type,
            weightKg: body.weight_kg,
            cbm: body.cbm,
          });
          return apiJson(result);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
