import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, badRequest, serverError } from "@/server/api-auth";

const SETTING_KEYS = ["company_profile", "operations", "pickup_policy"] as const;

function cleanSettings(body: any) {
  const source = body?.settings && typeof body.settings === "object" ? body.settings : body;
  const rows = SETTING_KEYS
    .filter((key) => source?.[key] && typeof source[key] === "object" && !Array.isArray(source[key]))
    .map((key) => ({ key, value: source[key] }));
  return rows;
}

async function saveSettings(request: Request) {
  const auth = await authenticate(request, { requireAdmin: true });
  if (!auth.ok) return auth.response;
  const body = await readJson<any>(request);
  const rows = cleanSettings(body).map((row) => ({
    ...row,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return badRequest("provide at least one settings object");
  const { data, error } = await (supabaseAdmin as any).from("system_settings")
    .upsert(rows, { onConflict: "key" })
    .select("key, value, updated_at");
  if (error) throw error;
  const settings = Object.fromEntries((data ?? []).map((row: any) => [row.key, row.value ?? {}]));
  return apiJson({ ok: true, settings, data });
}

export const Route = createFileRoute("/api/mobile/settings")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data, error } = await (supabaseAdmin as any).from("system_settings")
            .select("key, value, updated_at")
            .in("key", [...SETTING_KEYS])
            .order("key");
          if (error) throw error;
          const settings = Object.fromEntries((data ?? []).map((row: any) => [row.key, row.value ?? {}]));
          return apiJson({ settings, data });
        } catch (e) { return serverError(e); }
      },
      PATCH: async ({ request }) => {
        try {
          return await saveSettings(request);
        } catch (e) { return serverError(e); }
      },
      POST: async ({ request }) => {
        try {
          return await saveSettings(request);
        } catch (e) { return serverError(e); }
      },
    },
  },
});
