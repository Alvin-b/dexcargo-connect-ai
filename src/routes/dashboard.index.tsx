import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { clientInitiatePayment } from "@/lib/notify.functions";
import { toast } from "sonner";
import { Package, MapPin, Camera, CreditCard } from "lucide-react";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
});

function Overview() {
  const { isStaff, user } = useAuth();
  const qc = useQueryClient();
  const pay = useServerFn(clientInitiatePayment);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payPhone, setPayPhone] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["overview-stats", isStaff],
    enabled: isStaff,
    queryFn: async () => {
      const [pkgs, clients, payments, convs] = await Promise.all([
        supabase.from("packages").select("status", { count: "exact", head: false }),
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("payments").select("amount, status").eq("status", "success"),
        supabase.from("conversations").select("id", { count: "exact", head: true }),
      ]);
      const revenue = (payments.data ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
      return {
        totalPackages: pkgs.data?.length ?? 0,
        clients: clients.count ?? 0,
        revenue,
        conversations: convs.count ?? 0,
      };
    },
  });

  const { data: myPkgs } = useQuery({
    queryKey: ["my-packages", user?.id],
    enabled: !isStaff && !!user,
    queryFn: async () => {
      // RLS scopes to packages whose client.user_id = auth.uid()
      const { data } = await supabase
        .from("packages")
        .select(
          "id, tracking_number, description, status, estimated_arrival, mode, weight_kg, cbm, shipping_cost, currency, warehouse_photo_url, destination_city, destination_country, package_events(status, location, notes, created_at, photo_url)",
        )
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function submitPay(packageId: string) {
    if (!payPhone || !payAmount) return;
    setPayBusy(true);
    try {
      await pay({ data: { packageId, phone: payPhone, amount: Number(payAmount) } });
      toast.success("STK push sent — check your phone");
      setPayOpen(null);
      setPayPhone("");
      setPayAmount("");
      qc.invalidateQueries({ queryKey: ["my-packages"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPayBusy(false);
    }
  }

  if (!isStaff) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">My Packages</h1>
        {!myPkgs?.length && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>
                No packages yet. Send us your tracking number on WhatsApp once you ship and we'll
                link it to your account.
              </p>
            </CardContent>
          </Card>
        )}
        <div className="grid gap-4">
          {myPkgs?.map((p: any) => (
            <Card key={p.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <div className="font-mono font-semibold text-lg">{p.tracking_number}</div>
                    <div className="text-sm text-muted-foreground">{p.description ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      {p.mode && <span>✈️ {p.mode}</span>}
                      {p.weight_kg && <span>{p.weight_kg} kg</span>}
                      {p.cbm && <span>{p.cbm} CBM</span>}
                      {(p.destination_city || p.destination_country) && (
                        <span>
                          <MapPin className="h-3 w-3 inline" />{" "}
                          {[p.destination_city, p.destination_country].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge>{p.status.replace(/_/g, " ")}</Badge>
                </div>
                {p.warehouse_photo_url && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Camera className="h-3 w-3" /> Received in China
                    </div>
                    <img
                      src={p.warehouse_photo_url}
                      alt="Package"
                      className="rounded-md max-h-48 object-cover"
                    />
                  </div>
                )}
                {p.package_events?.length > 0 && (
                  <div className="border-l-2 border-primary/30 pl-3 space-y-2 ml-1">
                    {p.package_events
                      .sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at))
                      .map((e: any, i: number) => (
                        <div key={i} className="text-sm">
                          <div className="font-medium">{e.status.replace(/_/g, " ")}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString()}
                            {e.location ? ` • ${e.location}` : ""}
                          </div>
                          {e.notes && <div className="text-xs">{e.notes}</div>}
                        </div>
                      ))}
                  </div>
                )}
                {p.shipping_cost && (
                  <div className="flex items-center justify-between pt-3 border-t">
                    <div>
                      <div className="text-xs text-muted-foreground">Amount due</div>
                      <div className="text-xl font-bold">
                        {p.currency ?? "KES"} {Number(p.shipping_cost).toLocaleString()}
                      </div>
                    </div>
                    <Dialog
                      open={payOpen === p.id}
                      onOpenChange={(o) => {
                        setPayOpen(o ? p.id : null);
                        if (o) setPayAmount(String(p.shipping_cost));
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button>
                          <CreditCard className="h-4 w-4 mr-1" />
                          Pay with M-Pesa
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Pay for {p.tracking_number}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div>
                            <Label>M-Pesa phone (2547…)</Label>
                            <Input
                              value={payPhone}
                              onChange={(e) => setPayPhone(e.target.value)}
                              placeholder="254712345678"
                            />
                          </div>
                          <div>
                            <Label>Amount ({p.currency ?? "KES"})</Label>
                            <Input
                              type="number"
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                            />
                          </div>
                          <Button
                            className="w-full"
                            onClick={() => submitPay(p.id)}
                            disabled={payBusy}
                          >
                            {payBusy ? "Sending…" : "Send STK push"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Packages</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.totalPackages ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clients</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.clients ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Conversations
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.conversations ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue (KES)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">
            {(stats?.revenue ?? 0).toLocaleString()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
