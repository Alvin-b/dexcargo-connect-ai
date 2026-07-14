import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";
import { logAudit } from "@/server/audit";

type Platform = "android" | "ios";

function normalizePlatform(value: string | null): Platform | null {
  if (value === "android" || value === "ios") return value;
  return null;
}

export const Route = createFileRoute("/api/mobile/app-updates")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const platform = normalizePlatform(url.searchParams.get("platform"));
          if (!platform) return badRequest("platform must be android or ios");
          const channel = url.searchParams.get("channel") ?? "stable";
          const currentVersionCode = Number(url.searchParams.get("version_code") ?? 0);

          const { data, error } = await (supabaseAdmin.from("mobile_app_releases") as any)
            .select("*")
            .eq("platform", platform)
            .eq("channel", channel)
            .eq("published", true)
            .order("version_code", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;

          if (!data) {
            return apiJson({ update_available: false, platform, channel });
          }

          const updateAvailable = Number(data.version_code) > currentVersionCode;
          return apiJson({
            update_available: updateAvailable,
            platform,
            channel,
            latest: {
              version_name: data.version_name,
              version_code: data.version_code,
              release_notes: data.release_notes,
              download_url: data.download_url,
              checksum_sha256: data.checksum_sha256,
              mandatory: data.mandatory || currentVersionCode < Number(data.min_supported_version_code ?? 1),
              min_supported_version_code: data.min_supported_version_code,
              published_at: data.published_at,
            },
          });
        } catch (e) {
          return serverError(e);
        }
      },
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request, { requireAdmin: true });
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const platform = normalizePlatform(String(body?.platform ?? ""));
          if (!platform) return badRequest("platform must be android or ios");
          if (!body?.version_name) return badRequest("version_name required");
          if (!Number.isFinite(Number(body?.version_code))) return badRequest("version_code required");
          if (!body?.download_url) return badRequest("download_url required");

          const row = {
            platform,
            version_name: String(body.version_name),
            version_code: Number(body.version_code),
            channel: String(body.channel ?? "stable"),
            release_notes: body.release_notes ?? null,
            download_url: String(body.download_url),
            checksum_sha256: body.checksum_sha256 ?? null,
            mandatory: Boolean(body.mandatory ?? false),
            min_supported_version_code: Number(body.min_supported_version_code ?? 1),
            published: Boolean(body.published ?? true),
            published_at: body.published === false ? null : new Date().toISOString(),
            created_by: auth.userId,
          };

          const { data, error } = await (supabaseAdmin.from("mobile_app_releases") as any)
            .insert(row)
            .select("*")
            .single();
          if (error) throw error;

          await logAudit({
            actorId: auth.userId,
            action: "mobile_release.published",
            resourceType: "mobile_app_release",
            resourceId: data.id,
            metadata: { platform, version_code: row.version_code, channel: row.channel },
            request,
          });

          return apiJson({ ok: true, release: data }, 201);
        } catch (e) {
          return serverError(e);
        }
      },
    },
  },
});
