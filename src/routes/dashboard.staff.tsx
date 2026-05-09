import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/dashboard/staff")({
  component: StaffPage,
  head: () => ({ meta: [{ title: "Staff Management — Dexcargo" }] }),
});

const ALL_ROLES = ["admin", "staff", "china_staff", "kenya_staff", "client"] as const;
type Role = (typeof ALL_ROLES)[number];
type UserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: Role[];
  profile: { display_name: string | null; phone: string | null; preferred_language: string | null; location: string | null } | null;
};

async function authedFetch(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(path, { ...init, headers });
}

function StaffPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Set<Role>>(new Set());
  const [pendingLocation, setPendingLocation] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await authedFetch("/api/admin/users");
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to load users"); setLoading(false); return; }
    setUsers(json.users);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin, refresh]);

  function openEdit(u: UserRow) {
    setEditing(u);
    setPendingRoles(new Set(u.roles));
    setPendingLocation(u.profile?.location ?? "");
  }

  function toggleRole(r: Role) {
    const next = new Set(pendingRoles);
    if (next.has(r)) next.delete(r); else next.add(r);
    if (next.size === 0) next.add("client");
    setPendingRoles(next);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    const res = await authedFetch(`/api/admin/users/${editing.id}/roles`, {
      method: "POST",
      body: JSON.stringify({
        roles: Array.from(pendingRoles),
        location: pendingLocation || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Save failed"); return; }
    toast.success("Roles updated");
    setEditing(null);
    refresh();
  }

  if (authLoading || !user) return null;
  if (!isAdmin) return <div className="text-muted-foreground">Admin role required.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> Staff Management</h1>
        <p className="text-muted-foreground text-sm mt-1">Promote users to staff roles, assign their warehouse location, or revoke access.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>All users {users.length ? `(${users.length})` : ""}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Roles</TableHead>
              <TableHead>Location</TableHead><TableHead>Last sign-in</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!loading && users.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No users found.</TableCell></TableRow>}
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell className="text-sm">{u.profile?.display_name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="text-xs">{r}</Badge>
                      ))}
                      {u.roles.length === 0 && <span className="text-xs text-muted-foreground">none</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{u.profile?.location ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "—"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => openEdit(u)}><ShieldCheck className="h-3 w-3 mr-1" />Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit roles — {editing?.email}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Roles</Label>
              <div className="space-y-2">
                {ALL_ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={pendingRoles.has(r)} onCheckedChange={() => toggleRole(r)} />
                    <span className="font-mono">{r}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Warehouse location</Label>
              <select className="w-full border rounded-md px-3 py-2 bg-background text-sm" value={pendingLocation} onChange={(e) => setPendingLocation(e.target.value)}>
                <option value="">— none —</option>
                <option value="china">China</option>
                <option value="kenya">Kenya</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}