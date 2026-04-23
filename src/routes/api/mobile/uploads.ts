import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticate, apiJson, preflight, badRequest, serverError } from "@/server/api-auth";

// Upload an image (warehouse photo, marketing image, etc.) via multipart/form-data.
// Form fields: file (required), bucket (default: package-photos), path (optional).
export const Route = createFileRoute("/api/mobile/uploads")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if (!auth.ok) return auth.response;
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) return badRequest("file required (multipart/form-data)");
          const bucket = (form.get("bucket") as string) || "package-photos";
          const explicitPath = form.get("path") as string | null;
          const ext = file.name.split(".").pop() ?? "bin";
          const path = explicitPath || `${auth.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const buffer = new Uint8Array(await file.arrayBuffer());
          const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
            contentType: file.type || "application/octet-stream",
            upsert: true,
          });
          if (error) throw error;
          const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
          return apiJson({ bucket, path, public_url: pub.publicUrl }, 201);
        } catch (e) { return serverError(e); }
      },
    },
  },
});