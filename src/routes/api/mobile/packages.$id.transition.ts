import { createFileRoute } from "@tanstack/react-router";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";
import { getEmployeeByUserId } from "@/server/employees";
import { transitionStatus, type PkgStatus } from "@/server/packages";
import { logAudit } from "@/server/audit";

// POST /api/mobile/packages/:id/transition  { to: PkgStatus, notes? }
export const Route = createFileRoute("/api/mobile/packages/$id/transition")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const emp = await getEmployeeByUserId(auth.userId);
          const body = await readJson<any>(request);
          const to = body?.to as PkgStatus;
          if (!to) return badRequest("to status required");
          const pkg = await transitionStatus(params.id, to, emp?.id ?? null, body?.notes);
          await logAudit({ actorId: auth.userId, action: `package.transition.${to}`, resourceType: "package", resourceId: params.id, request });
          return apiJson({ ok: true, package: pkg });
        } catch (e: any) {
          if (String(e?.message ?? "").includes("invalid transition")) return apiJson({ error: e.message }, 409);
          return serverError(e);
        }
      },
    },
  },
});