import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/conversations")({ component: ConversationsPage });

function ConversationsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const { data: convs, refetch: refetchConvs } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => (await supabase.from("conversations").select("*, clients(full_name)").order("last_message_at", { ascending: false, nullsFirst: false }).limit(50)).data ?? [],
  });
  const { data: msgs, refetch: refetchMsgs } = useQuery({
    queryKey: ["messages", selected],
    enabled: !!selected,
    queryFn: async () => (await supabase.from("messages").select("*").eq("conversation_id", selected!).order("created_at")).data ?? [],
  });

  useEffect(() => {
    const ch = supabase.channel("msg-realtime").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => { refetchMsgs(); refetchConvs(); }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetchMsgs, refetchConvs]);

  async function toggleAi(id: string, val: boolean) {
    await supabase.from("conversations").update({ ai_enabled: val }).eq("id", id);
    refetchConvs();
  }

  const cur = convs?.find((c) => c.id === selected);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">WhatsApp Conversations</h1>
      <div className="grid grid-cols-12 gap-4 h-[70vh]">
        <div className="col-span-4 border rounded-lg overflow-hidden">
          <ScrollArea className="h-full">
            {convs?.map((c) => (
              <button key={c.id} onClick={() => setSelected(c.id)} className={`w-full text-left p-3 border-b hover:bg-accent ${selected === c.id ? "bg-accent" : ""}`}>
                <div className="font-medium">{(c as any).clients?.full_name ?? c.whatsapp_number}</div>
                <div className="text-xs text-muted-foreground">{c.whatsapp_number}</div>
                {!c.ai_enabled && <Badge variant="outline" className="mt-1 text-xs">Human</Badge>}
              </button>
            ))}
          </ScrollArea>
        </div>
        <Card className="col-span-8 flex flex-col">
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            {cur && (
              <div className="p-3 border-b flex items-center justify-between">
                <div className="font-medium">{cur.whatsapp_number}</div>
                <div className="flex items-center gap-2"><Label htmlFor="ai" className="text-sm">AI Agent</Label><Switch id="ai" checked={cur.ai_enabled} onCheckedChange={(v) => toggleAi(cur.id, v)} /></div>
              </div>
            )}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2">
                {msgs?.map((m) => (
                  <div key={m.id} className={`max-w-[80%] p-3 rounded-lg ${m.role === "user" ? "bg-muted" : "bg-primary text-primary-foreground ml-auto"}`}>
                    <div className="text-xs opacity-70 mb-1">{m.role}</div>
                    <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                  </div>
                ))}
                {!selected && <div className="text-center text-muted-foreground p-8">Select a conversation</div>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}