import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, ImageIcon, Send, Calendar, Trash2, ExternalLink } from "lucide-react";
import { generateMarketingPost, generateMarketingImage, scheduleMarketingPost, publishMarketingPost, deleteMarketingPost } from "@/server/notify.functions";

export const Route = createFileRoute("/dashboard/marketing")({ component: MarketingPage });

function MarketingPage() {
  const qc = useQueryClient();
  const gen = useServerFn(generateMarketingPost);
  const genImg = useServerFn(generateMarketingImage);
  const sched = useServerFn(scheduleMarketingPost);
  const pub = useServerFn(publishMarketingPost);
  const del = useServerFn(deleteMarketingPost);
  const [platform, setPlatform] = useState<"facebook"|"instagram"|"tiktok"|"x">("instagram");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState<string>("");

  const { data: posts } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => (await supabase.from("marketing_posts").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  async function generate() {
    if (!topic) return;
    setBusy(true);
    try { await gen({ data: { platform, topic } }); toast.success("Draft generated"); qc.invalidateQueries({ queryKey: ["posts"] }); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function addImage(postId: string, prompt: string) {
    setBusyId(postId);
    try { await genImg({ data: { postId, prompt } }); toast.success("Image added"); qc.invalidateQueries({ queryKey: ["posts"] }); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  }
  async function publishNow(postId: string) {
    setBusyId(postId);
    try {
      const r = await pub({ data: { postId } });
      if (r.ok) toast.success("Published"); else toast.error(`Publish failed: ${(r.result as any).error}`);
      qc.invalidateQueries({ queryKey: ["posts"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  }
  async function schedule(postId: string) {
    if (!scheduleAt) return;
    setBusyId(postId);
    try { await sched({ data: { postId, scheduledFor: new Date(scheduleAt).toISOString() } }); toast.success("Scheduled"); setScheduleId(null); setScheduleAt(""); qc.invalidateQueries({ queryKey: ["posts"] }); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  }
  async function remove(postId: string) {
    if (!confirm("Delete this post?")) return;
    setBusyId(postId);
    try { await del({ data: { postId } }); qc.invalidateQueries({ queryKey: ["posts"] }); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Marketing AI</h1>
        <p className="text-sm text-muted-foreground">Generate posts, attach AI images, schedule and publish to social platforms.</p>
      </div>
      <Card><CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div><Label>Platform</Label>
            <Select value={platform} onValueChange={(v: any) => setPlatform(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="facebook">Facebook</SelectItem><SelectItem value="instagram">Instagram</SelectItem><SelectItem value="tiktok">TikTok</SelectItem><SelectItem value="x">X (Twitter)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Topic / brief</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. New air freight rates from Guangzhou to Nairobi" /></div>
        </div>
        <Button onClick={generate} disabled={busy}><Sparkles className="h-4 w-4 mr-1" />{busy ? "Generating…" : "Generate post"}</Button>
      </CardContent></Card>

      <div className="grid gap-3">
        {posts?.map((p) => (
          <Card key={p.id}><CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-start gap-2">
              <div className="flex gap-2 items-center">
                <Badge variant="outline">{p.platform.toUpperCase()}</Badge>
                <Badge variant={p.status === "published" ? "default" : p.status === "scheduled" ? "secondary" : "outline"}>{p.status}</Badge>
                {p.scheduled_for && <span className="text-xs text-muted-foreground">📅 {new Date(p.scheduled_for).toLocaleString()}</span>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(p.id)} disabled={busyId === p.id}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {p.image_url && <img src={p.image_url} alt="" className="rounded-md max-h-72 object-cover w-full" />}
            <div className="whitespace-pre-wrap text-sm">{p.content}</div>
            {p.hashtags && <div className="text-xs text-primary">{p.hashtags}</div>}
            {p.external_post_id && (
              <div className="text-xs text-muted-foreground">External ID: {p.external_post_id}</div>
            )}
            {p.status !== "published" && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {!p.image_url && (
                  <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => addImage(p.id, p.content.slice(0, 200))}>
                    <ImageIcon className="h-3.5 w-3.5 mr-1" />{busyId === p.id ? "Generating…" : "Add AI image"}
                  </Button>
                )}
                <Button size="sm" disabled={busyId === p.id} onClick={() => publishNow(p.id)}>
                  <Send className="h-3.5 w-3.5 mr-1" />Publish now
                </Button>
                {scheduleId === p.id ? (
                  <div className="flex gap-2 items-center">
                    <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="h-8 w-auto" />
                    <Button size="sm" disabled={busyId === p.id || !scheduleAt} onClick={() => schedule(p.id)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setScheduleId(null); setScheduleAt(""); }}>Cancel</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setScheduleId(p.id)}>
                    <Calendar className="h-3.5 w-3.5 mr-1" />Schedule
                  </Button>
                )}
              </div>
            )}
            {p.status === "published" && p.external_post_id && p.platform === "facebook" && (
              <a href={`https://facebook.com/${p.external_post_id}`} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />View on Facebook</a>
            )}
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}