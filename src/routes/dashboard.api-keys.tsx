import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, Trash2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/dashboard/api-keys")({
  component: ApiKeysPage,
  head: () => ({ meta: [{ title: "Mobile API Keys — Dexcargo" }] }),
});

type Key = { id: string; user_id: string; label: string; key_prefix: string; created_at: string; revoked_at: string | null; last_used_at: string | null };
type Employee = { id: string; display_name: string | null };

function ApiKeysPage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<Key[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [label, setLabel] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const admin = (roles ?? []).some((r) => r.role === "admin");
      setIsAdmin(admin);
      if (!admin) return;
      await refresh();
      const { data: profs } = await supabase.from("profiles").select("id, display_name");
      setEmployees(profs ?? []);
      setEmployeeId(user.id);
    })();
  }, [user]);

  async function refresh() {
    const { data } = await supabase.from("employee_api_keys").select("*").order("created_at", { ascending: false });
    setKeys((data as Key[]) ?? []);
  }

  async function issue() {
    if (!label || !employeeId) { toast.error("Pick an employee and a label"); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("issue_api_key", { _user_id: employeeId, _label: label });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setIssuedKey(row?.raw_key ?? null);
    setLabel("");
    refresh();
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? The mobile app using it will be locked out.")) return;
    const { error } = await supabase.from("employee_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  if (!user) return null;
  if (!isAdmin) return <div className="text-muted-foreground">Admin role required to manage API keys.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><KeyRound className="h-6 w-6" /> Mobile API Keys</h1>
        <p className="text-muted-foreground text-sm mt-1">Issue per-employee keys for the mobile management app. Send the key as <code className="text-xs bg-muted px-1 rounded">X-API-Key</code> header.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Issue a new key</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <select className="border rounded-md px-3 py-2 bg-background" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.display_name ?? e.id}</option>)}
            </select>
            <Input placeholder="Label e.g. John's Phone" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Button onClick={issue} disabled={loading}>{loading ? "Issuing…" : "Issue key"}</Button>
          </div>
          {issuedKey && (
            <div className="p-3 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
              <div className="text-sm font-medium mb-1">New key (copy now — it will not be shown again):</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background p-2 rounded border break-all">{issuedKey}</code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(issuedKey); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setIssuedKey(null)}>Dismiss</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Active keys</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Prefix</TableHead><TableHead>Employee</TableHead><TableHead>Last used</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.label}</TableCell>
                  <TableCell><code className="text-xs">{k.key_prefix}…</code></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{employees.find((e) => e.id === k.user_id)?.display_name ?? k.user_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-xs">{k.revoked_at ? <span className="text-destructive">Revoked</span> : <span className="text-green-600">Active</span>}</TableCell>
                  <TableCell>{!k.revoked_at && <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
                </TableRow>
              ))}
              {keys.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No keys issued yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}