import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/rates")({ component: RatesPage });

function RatesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "general", mode: "air", destination_country: "Kenya", price_per_kg: "", price_per_cbm: "", min_charge: "" });
  const { data } = useQuery({
    queryKey: ["rates"],
    queryFn: async () => (await supabase.from("rates").select("*").order("destination_country").order("mode")).data ?? [],
  });

  async function add() {
    const { error } = await supabase.from("rates").insert({
      category: form.category, mode: form.mode as any, destination_country: form.destination_country,
      price_per_kg: form.price_per_kg ? Number(form.price_per_kg) : null,
      price_per_cbm: form.price_per_cbm ? Number(form.price_per_cbm) : null,
      min_charge: form.min_charge ? Number(form.min_charge) : null,
    });
    if (error) return toast.error(error.message);
    toast.success("Rate added"); setOpen(false); qc.invalidateQueries({ queryKey: ["rates"] });
  }
  async function del(id: string) {
    await supabase.from("rates").delete().eq("id", id); qc.invalidateQueries({ queryKey: ["rates"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Shipping Rates</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New rate</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add rate</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Mode</Label>
                  <Select value={form.mode} onValueChange={(v) => setForm({...form, mode: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="air">Air</SelectItem><SelectItem value="sea">Sea</SelectItem><SelectItem value="express">Express</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Destination country</Label><Input value={form.destination_country} onChange={(e) => setForm({...form, destination_country: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Price/kg</Label><Input type="number" value={form.price_per_kg} onChange={(e) => setForm({...form, price_per_kg: e.target.value})} /></div>
                <div><Label>Price/CBM</Label><Input type="number" value={form.price_per_cbm} onChange={(e) => setForm({...form, price_per_cbm: e.target.value})} /></div>
                <div><Label>Min charge</Label><Input type="number" value={form.min_charge} onChange={(e) => setForm({...form, min_charge: e.target.value})} /></div>
              </div>
              <Button onClick={add} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-2">
        {data?.map((r) => (
          <Card key={r.id}><CardContent className="p-4 flex justify-between items-center">
            <div>
              <div className="font-medium">{r.category} • {r.mode.toUpperCase()} → {r.destination_country}</div>
              <div className="text-sm text-muted-foreground">{r.price_per_kg ? `KES ${r.price_per_kg}/kg ` : ""}{r.price_per_cbm ? `KES ${r.price_per_cbm}/CBM ` : ""}{r.min_charge ? `min ${r.min_charge}` : ""}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}