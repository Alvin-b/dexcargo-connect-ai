import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, readJson, notFound, serverError } from "@/server/api-auth";

export const Route = createFileRoute("/api/mobile/customers/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const { data } = await (supabaseAdmin.from("customers") as any).select("*").eq("id", params.id).maybeSingle();
          if (!data) return notFound("customer not found");
          const { data: packages } = await (supabaseAdmin.from("packages") as any)
            .select("id, tracking_number, status, amount_due, amount_paid, received_at, collected_at")
            .eq("customer_id", params.id).order("received_at", { ascending: false }).limit(100);
          const outstanding = (packages ?? []).reduce((s: number, p: any) => s + Math.max(0, Number(p.amount_due ?? 0) - Number(p.amount_paid ?? 0)), 0);
          return apiJson({ ...data, packages: packages ?? [], outstanding_balance: outstanding });
        } catch (e) { return serverError(e); }
      },
      PATCH: async ({ request, params }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const body = await readJson<any>(request);
          const { data, error } = await (supabaseAdmin.from("customers") as any).update(body ?? {}).eq("id", params.id).select().maybeSingle();
          if (error) throw error;
          if (!data) return notFound("customer not found");
          return apiJson(data);
        } catch (e) { return serverError(e); }
      },
    },
  },
});