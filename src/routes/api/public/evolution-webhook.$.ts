import { createFileRoute } from "@tanstack/react-router";
import { handleEvolutionWebhook } from "./evolution-webhook";

// Evolution API often appends the event name as a path segment, e.g.
//   /api/public/evolution-webhook/messages-upsert
// This splat route catches all such sub-paths and delegates to the same handler.
export const Route = createFileRoute("/api/public/evolution-webhook/$")({
  server: {
    handlers: {
      POST: async ({ request }) => handleEvolutionWebhook(request),
    },
  },
});
