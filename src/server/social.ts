// Social media auto-publishing for Facebook, Instagram, TikTok, X.
// All credentials are pulled from env. Functions degrade gracefully when not configured.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Platform = "facebook" | "instagram" | "tiktok" | "x";

type PublishOk = { ok: true; externalId?: string; permalink?: string; raw?: any };
type PublishErr = { ok: false; error: string; raw?: any };
type PublishResult = PublishOk | PublishErr;

function need(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

// --- Facebook Page ---
async function publishFacebook(content: string, imageUrl?: string): Promise<PublishResult> {
  const pageId = need("FB_PAGE_ID");
  const token = need("FB_PAGE_ACCESS_TOKEN");
  if (!pageId || !token) return { ok: false, error: "Facebook not configured (FB_PAGE_ID/FB_PAGE_ACCESS_TOKEN)" };
  const endpoint = imageUrl
    ? `https://graph.facebook.com/v20.0/${pageId}/photos`
    : `https://graph.facebook.com/v20.0/${pageId}/feed`;
  const body = new URLSearchParams();
  body.set("access_token", token);
  if (imageUrl) { body.set("url", imageUrl); body.set("caption", content); }
  else body.set("message", content);
  const res = await fetch(endpoint, { method: "POST", body });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: j.error?.message || `FB ${res.status}`, raw: j };
  const id = j.post_id || j.id;
  return { ok: true, externalId: id, permalink: id ? `https://facebook.com/${id}` : undefined, raw: j };
}

// --- Instagram Business (requires public image URL) ---
async function publishInstagram(content: string, imageUrl?: string): Promise<PublishResult> {
  const igId = need("IG_BUSINESS_ID");
  const token = need("IG_ACCESS_TOKEN") || need("FB_PAGE_ACCESS_TOKEN");
  if (!igId || !token) return { ok: false, error: "Instagram not configured (IG_BUSINESS_ID/IG_ACCESS_TOKEN)" };
  if (!imageUrl) return { ok: false, error: "Instagram requires an image" };
  // 1. Create container
  const c = new URLSearchParams({ image_url: imageUrl, caption: content, access_token: token });
  const cRes = await fetch(`https://graph.facebook.com/v20.0/${igId}/media`, { method: "POST", body: c });
  const cJ: any = await cRes.json().catch(() => ({}));
  if (!cRes.ok || !cJ.id) return { ok: false, error: cJ.error?.message || `IG container ${cRes.status}`, raw: cJ };
  // 2. Publish container
  const p = new URLSearchParams({ creation_id: cJ.id, access_token: token });
  const pRes = await fetch(`https://graph.facebook.com/v20.0/${igId}/media_publish`, { method: "POST", body: p });
  const pJ: any = await pRes.json().catch(() => ({}));
  if (!pRes.ok || !pJ.id) return { ok: false, error: pJ.error?.message || `IG publish ${pRes.status}`, raw: pJ };
  return { ok: true, externalId: pJ.id, raw: pJ };
}

// --- X (Twitter) v2 — requires user OAuth2 bearer with tweet.write ---
async function publishX(content: string): Promise<PublishResult> {
  const token = need("X_BEARER_TOKEN");
  if (!token) return { ok: false, error: "X not configured (X_BEARER_TOKEN)" };
  const text = content.length > 270 ? content.slice(0, 267) + "..." : content;
  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: j.detail || j.title || `X ${res.status}`, raw: j };
  const id = j.data?.id;
  return { ok: true, externalId: id, permalink: id ? `https://x.com/i/web/status/${id}` : undefined, raw: j };
}

// --- TikTok (Content Posting API direct post) ---
async function publishTikTok(content: string, _imageUrl?: string): Promise<PublishResult> {
  const token = need("TIKTOK_ACCESS_TOKEN");
  if (!token) return { ok: false, error: "TikTok not configured (TIKTOK_ACCESS_TOKEN)" };
  // TikTok requires video; for text/caption only we mark as draft for manual posting
  return { ok: false, error: "TikTok requires a video upload — not supported in MVP. Save as draft and post manually." };
}

export async function publishToPlatform(platform: Platform, content: string, imageUrl?: string): Promise<PublishResult> {
  try {
    switch (platform) {
      case "facebook": return await publishFacebook(content, imageUrl);
      case "instagram": return await publishInstagram(content, imageUrl);
      case "x": return await publishX(content);
      case "tiktok": return await publishTikTok(content, imageUrl);
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Publish a saved marketing_post and record the result
export async function publishPost(postId: string): Promise<{ ok: boolean; result: PublishResult }> {
  const sb = supabaseAdmin;
  const { data: post, error } = await sb.from("marketing_posts").select("*").eq("id", postId).maybeSingle();
  if (error || !post) throw new Error(error?.message || "Post not found");
  const result = await publishToPlatform(post.platform as Platform, post.content + (post.hashtags ? `\n\n${post.hashtags}` : ""), post.image_url ?? undefined);
  await sb.from("social_publish_results").insert({
    post_id: post.id,
    platform: post.platform,
    status: result.ok ? "success" : "failed",
    external_id: result.ok ? result.externalId ?? null : null,
    permalink: result.ok ? result.permalink ?? null : null,
    error: result.ok ? null : result.error,
    raw_response: (result as any).raw ?? null,
  });
  await sb.from("marketing_posts").update({
    status: result.ok ? "published" : "draft",
    published_at: result.ok ? new Date().toISOString() : null,
    external_post_id: result.ok ? result.externalId ?? null : null,
  }).eq("id", post.id);
  return { ok: result.ok, result };
}