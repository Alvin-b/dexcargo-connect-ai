import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, UserPlus } from "lucide-react";

export const Route = createFileRoute("/dashboard/clients")({ component: ClientsPage });

function ClientsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", whatsapp_number: "", country: "", city: "", email: "" });
  const { data } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await supabase.from("clients").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  async function create() {
    const { error } = await supabase.from("clients").insert({
      full_name: form.full_name,
      whatsapp_number: form.whatsapp_number.replace(/\D/g, ""),
      country: form.country || null, city: form.city || null, email: form.email || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Client added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["clients"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New client</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add client</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({...form, full_name: e.target.value})} /></div>
              <div><Label>WhatsApp number (with country code)</Label><Input value={form.whatsapp_number} onChange={(e) => setForm({...form, whatsapp_number: e.target.value})} placeholder="2547xxxxxxxx" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({...form, country: e.target.value})} /></div>
                <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({...form, city: e.target.value})} /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} /></div>
              <Button onClick={create} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-2">
        {data?.map((c) => (
          <Card key={c.id}><CardContent className="p-4 flex justify-between">
            <div><div className="font-medium">{c.full_name}</div><div className="text-sm text-muted-foreground">{c.whatsapp_number} • {[c.city, c.country].filter(Boolean).join(", ")}</div></div>
            <div className="text-xs text-muted-foreground">{c.email}</div>
          </CardContent></Card>
        ))}
        {!data?.length && <Card><CardContent className="p-8 text-center text-muted-foreground"><UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />No clients yet.</CardContent></Card>}
      </div>
    </div>
  );
}