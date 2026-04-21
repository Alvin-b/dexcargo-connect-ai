import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
});

function Overview() {
  const { isStaff } = useAuth();
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
    queryKey: ["my-packages"],
    enabled: !isStaff,
    queryFn: async () => {
      const { data } = await supabase.from("packages").select("tracking_number, description, status, estimated_arrival").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (!isStaff) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">My Packages</h1>
        {!myPkgs?.length && <p className="text-muted-foreground">No packages yet. Send us your tracking number on WhatsApp once you ship.</p>}
        <div className="grid gap-3">
          {myPkgs?.map((p) => (
            <Card key={p.tracking_number}>
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-mono font-medium">{p.tracking_number}</div>
                  <div className="text-sm text-muted-foreground">{p.description}</div>
                </div>
                <Badge>{p.status.replace(/_/g, " ")}</Badge>
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
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Packages</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.totalPackages ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Clients</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.clients ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Conversations</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.conversations ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Revenue (KES)</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{(stats?.revenue ?? 0).toLocaleString()}</CardContent></Card>
      </div>
    </div>
  );
}