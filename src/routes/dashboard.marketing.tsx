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
import { Sparkles } from "lucide-react";
import { generateMarketingPost } from "@/server/notify.functions";

export const Route = createFileRoute("/dashboard/marketing")({ component: MarketingPage });

function MarketingPage() {
  const qc = useQueryClient();
  const gen = useServerFn(generateMarketingPost);
  const [platform, setPlatform] = useState<"facebook"|"instagram"|"tiktok"|"x">("instagram");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Marketing AI</h1>
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
          <Card key={p.id}><CardContent className="p-4 space-y-2">
            <div className="flex justify-between"><Badge variant="outline">{p.platform.toUpperCase()}</Badge><Badge>{p.status}</Badge></div>
            <div className="whitespace-pre-wrap text-sm">{p.content}</div>
            {p.hashtags && <div className="text-xs text-blue-600">{p.hashtags}</div>}
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}