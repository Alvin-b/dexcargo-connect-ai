import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Package, Users, MessageSquare, DollarSign, Megaphone, LayoutDashboard, LogOut, KeyRound, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
  head: () => ({ meta: [{ title: "Dashboard — Dexcargo" }] }),
});

function DashboardLayout() {
  const { user, isStaff, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  const staffNav = [
        { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { to: "/dashboard/packages", label: "Packages", icon: Package },
        { to: "/dashboard/clients", label: "Clients", icon: Users },
        { to: "/dashboard/conversations", label: "WhatsApp", icon: MessageSquare },
        { to: "/dashboard/rates", label: "Rates", icon: DollarSign },
        { to: "/dashboard/marketing", label: "Marketing", icon: Megaphone },
        { to: "/dashboard/api-keys", label: "API Keys", icon: KeyRound },
      ];
  if (isAdmin) staffNav.push({ to: "/dashboard/staff", label: "Staff", icon: ShieldCheck });
  const nav = isStaff
    ? staffNav
    : [
        { to: "/dashboard", label: "My Packages", icon: Package },
      ];

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-60 bg-card border-r flex flex-col">
        <div className="p-4 border-b">
          <Link to="/" className="text-xl font-bold text-primary">Dexcargo</Link>
          <div className="text-xs text-muted-foreground mt-1">{isStaff ? "Staff portal" : "Client portal"}</div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent" activeProps={{ className: "bg-accent font-medium" }}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t">
          <div className="text-xs text-muted-foreground px-2 mb-1 truncate">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}