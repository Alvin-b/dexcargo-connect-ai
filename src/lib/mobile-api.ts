import { supabase } from "@/integrations/supabase/client";

type ApiOptions = RequestInit & { auth?: boolean };

export async function mobileApi<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");

  if (options.auth !== false) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed: ${response.status}`);
  }
  return payload as T;
}

export async function uploadMobileImage(file: Blob, name: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const form = new FormData();
  form.append("file", file, name);

  const response = await fetch("/api/mobile/uploads", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error ?? "Image upload failed");
  return payload as { public_url: string; path: string; bucket: string };
}
