import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { mobileApi, uploadMobileImage } from "@/lib/mobile-api";
import { captureAndRecognizeSticker, scanBarcodeValue, type OcrDraft } from "@/lib/mobile-ocr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bell, Box, Camera, LogOut, Megaphone, RefreshCw, ScanLine, Shield, Users } from "lucide-react";

type Me = {
  user_id: string;
  profile?: { display_name?: string | null };
  roles: string[];
  is_admin: boolean;
  permissions: string[];
};

type DashboardStats = {
  today: {
    received: number;
    awaiting_payment: number;
    ready_for_collection: number;
    cleared: number;
    revenue_kes: number;
  };
  active_employees: number;
  revenue_30d_kes: number;
};

type PackageRow = {
  id: string;
  tracking_number: string;
  status: string;
  description: string | null;
  supplier: string | null;
  amount_due: number;
  received_at: string | null;
  customers?: { full_name?: string | null; phone?: string | null } | null;
};

type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  audience: string;
  severity: string;
  created_at: string;
  read: boolean;
};

type EmployeeRow = {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
};

export const Route = createFileRoute("/ops")({
  component: OpsApp,
  head: () => ({
    meta: [
      { title: "DEXCARGO Ops" },
      { name: "description", content: "Private DEXCARGO employee operations app." },
    ],
  }),
});

function roleLabel(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function audienceFor(me: Me | null) {
  if (!me) return "all";
  if (me.roles.includes("sales_rep")) return "sales_rep";
  if (me.roles.includes("sales_manager")) return "sales_manager";
  if (me.roles.includes("logistics_manager")) return "logistics_manager";
  return "all";
}

function fmtKes(value: number) {
  return `KES ${Number(value ?? 0).toLocaleString()}`;
}

export function OpsApp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [ocrDraft, setOcrDraft] = useState<OcrDraft | null>(null);
  const [employeeForm, setEmployeeForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    role: "sales_rep",
  });
  const [broadcast, setBroadcast] = useState({ audience: "all", message: "" });

  const primaryRole = useMemo(() => me?.roles.find((role) => role !== "staff") ?? me?.roles[0] ?? "staff", [me]);
  const isAdmin = Boolean(me?.is_admin || me?.roles.includes("admin"));

  async function loadSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await loadData();
  }

  async function loadData() {
    const [meResult, statsResult, packageResult] = await Promise.all([
      mobileApi<Me>("/api/mobile/auth/me"),
      mobileApi<DashboardStats>("/api/mobile/stats/dashboard"),
      mobileApi<{ data: PackageRow[] }>("/api/mobile/packages?limit=25"),
    ]);
    setMe(meResult);
    setStats(statsResult);
    setPackages(packageResult.data ?? []);

    const notificationResult = await mobileApi<{ data: NotificationRow[] }>(
      `/api/mobile/notifications?audience=${encodeURIComponent(audienceFor(meResult))}&limit=20`,
    );
    setNotifications(notificationResult.data ?? []);

    if (meResult.is_admin || meResult.roles.includes("admin")) {
      const employeeResult = await mobileApi<{ data: EmployeeRow[] }>("/api/mobile/admin/employees?status=active");
      setEmployees(employeeResult.data ?? []);
    }
  }

  useEffect(() => {
    loadSession().catch(() => undefined);
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    try {
      await loadData();
      toast.success("Authenticated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load dashboard");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMe(null);
    setStats(null);
    setPackages([]);
    setNotifications([]);
    setEmployees([]);
  }

  async function checkForUpdate() {
    const info = await App.getInfo().catch(() => ({ build: "1", version: "1.0.0" }));
    const platform = /iphone|ipad|ios/i.test(navigator.userAgent) ? "ios" : "android";
    const result = await mobileApi<any>(
      `/api/mobile/app-updates?platform=${platform}&version_code=${encodeURIComponent(info.build ?? "1")}`,
      { auth: false },
    );
    if (!result.update_available) {
      toast.success(`DEXCARGO Ops ${info.version ?? ""} is up to date`);
      return;
    }
    toast.info(`Update ${result.latest.version_name} available`);
    if (result.latest.download_url) {
      await Browser.open({ url: result.latest.download_url });
    }
  }

  async function runBarcodeScan() {
    try {
      const code = await scanBarcodeValue();
      if (!code) return toast.error("No barcode detected");
      const result = await mobileApi<{ package: PackageRow }>("/api/mobile/packages/scan", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setPackages((current) => [result.package, ...current.filter((pkg) => pkg.id !== result.package.id)]);
      toast.success(`Found ${result.package.tracking_number}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed");
    }
  }

  async function runStickerOcr() {
    try {
      const draft = await captureAndRecognizeSticker();
      setOcrDraft(draft);
      toast.success(draft.trackingNumber ? `OCR found ${draft.trackingNumber}` : "OCR completed. Review the text.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OCR failed");
    }
  }

  async function createPackageFromOcr() {
    if (!ocrDraft?.trackingNumber) return toast.error("Tracking number required before saving");
    try {
      setBusy(true);
      let intakePhotoUrl = "";
      if (ocrDraft.imageWebPath) {
        const imageBlob = await fetch(ocrDraft.imageWebPath).then((res) => res.blob());
        const uploaded = await uploadMobileImage(imageBlob, `${ocrDraft.trackingNumber}.jpg`);
        intakePhotoUrl = uploaded.public_url;
      }
      const result = await mobileApi<{ package: PackageRow }>("/api/mobile/packages", {
        method: "POST",
        body: JSON.stringify({
          tracking_number: ocrDraft.trackingNumber,
          intake_photo_url: intakePhotoUrl,
          customer_phone: ocrDraft.customerPhone || undefined,
          supplier: ocrDraft.supplier || undefined,
          description: ocrDraft.description || undefined,
          weight_kg: ocrDraft.weightKg ? Number(ocrDraft.weightKg) : undefined,
          pieces: ocrDraft.pieces ? Number(ocrDraft.pieces) : undefined,
          ocr_payload: { raw_text: ocrDraft.rawText },
          ocr_confidence: ocrDraft.trackingNumber ? 0.88 : 0.35,
        }),
      });
      setPackages((current) => [result.package, ...current]);
      setOcrDraft(null);
      toast.success("Package registered");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Package save failed");
    } finally {
      setBusy(false);
    }
  }

  async function registerEmployee(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await mobileApi("/api/mobile/admin/employees", {
        method: "POST",
        body: JSON.stringify(employeeForm),
      });
      setEmployeeForm({ full_name: "", email: "", password: "", phone: "", role: "sales_rep" });
      await loadData();
      toast.success("Employee registered");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Employee registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendBroadcast(event: React.FormEvent) {
    event.preventDefault();
    try {
      await mobileApi("/api/mobile/notifications", {
        method: "POST",
        body: JSON.stringify({ action: "broadcast", ...broadcast }),
      });
      setBroadcast({ audience: "all", message: "" });
      toast.success("Broadcast sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Broadcast failed");
    }
  }

  if (!me) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5">
          <div className="mb-8">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">Private company app</div>
            <h1 className="mt-3 text-4xl font-black tracking-tight">DEXCARGO Ops</h1>
            <p className="mt-2 text-sm text-slate-300">Sign in with employee credentials issued by an administrator.</p>
          </div>
          <form onSubmit={signIn} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="space-y-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </div>
              <Button className="w-full" disabled={busy}>{busy ? "Authenticating..." : "Authenticate session"}</Button>
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 pb-10 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">DEXCARGO Ops</div>
            <h1 className="text-xl font-bold">{me.profile?.display_name ?? "Employee"}</h1>
            <div className="text-xs text-slate-400">{roleLabel(primaryRole)}</div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={checkForUpdate}><RefreshCw className="mr-2 h-4 w-4" />Update</Button>
            <Button size="sm" variant="outline" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Exit</Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-4 md:grid-cols-4">
        <Metric icon={Box} label="Received today" value={stats?.today.received ?? 0} />
        <Metric icon={Shield} label="Awaiting payment" value={stats?.today.awaiting_payment ?? 0} />
        <Metric icon={ScanLine} label="Ready collection" value={stats?.today.ready_for_collection ?? 0} />
        <Metric icon={Users} label="Active employees" value={stats?.active_employees ?? 0} />
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Warehouse Scanner</span>
              <Badge variant="secondary">ML Kit</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={runBarcodeScan}><ScanLine className="mr-2 h-4 w-4" />Scan barcode</Button>
              <Button variant="secondary" onClick={runStickerOcr}><Camera className="mr-2 h-4 w-4" />OCR sticker</Button>
            </div>
            {ocrDraft && (
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <Field label="Tracking" value={ocrDraft.trackingNumber} onChange={(value) => setOcrDraft({ ...ocrDraft, trackingNumber: value })} />
                  <Field label="Phone" value={ocrDraft.customerPhone} onChange={(value) => setOcrDraft({ ...ocrDraft, customerPhone: value })} />
                  <Field label="Weight kg" value={ocrDraft.weightKg} onChange={(value) => setOcrDraft({ ...ocrDraft, weightKg: value })} />
                  <Field label="Pieces" value={ocrDraft.pieces} onChange={(value) => setOcrDraft({ ...ocrDraft, pieces: value })} />
                  <Field label="Supplier" value={ocrDraft.supplier} onChange={(value) => setOcrDraft({ ...ocrDraft, supplier: value })} />
                  <Field label="Goods" value={ocrDraft.description} onChange={(value) => setOcrDraft({ ...ocrDraft, description: value })} />
                </div>
                <Button className="mt-3 w-full" onClick={createPackageFromOcr} disabled={busy}>Save package to backend</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Notifications</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {notifications.length === 0 && <div className="text-sm text-slate-400">No notifications.</div>}
            {notifications.map((item) => (
              <div key={item.id} className="rounded-md border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{item.title}</div>
                  <Badge>{item.audience}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-300">{item.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto mt-4 grid max-w-6xl gap-4 px-4 lg:grid-cols-[1fr_1fr]">
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader><CardTitle>Recent Packages</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {packages.map((pkg) => (
              <div key={pkg.id} className="rounded-md border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-sm font-semibold">{pkg.tracking_number}</div>
                  <Badge variant="secondary">{pkg.status}</Badge>
                </div>
                <div className="mt-1 text-sm text-slate-300">{pkg.customers?.full_name ?? pkg.supplier ?? "Unassigned customer"}</div>
                <div className="mt-1 text-xs text-slate-500">{pkg.description ?? "No description"} · {fmtKes(pkg.amount_due)}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Admin Console</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={registerEmployee} className="grid gap-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <Input placeholder="Full name" value={employeeForm.full_name} onChange={(e) => setEmployeeForm({ ...employeeForm, full_name: e.target.value })} required />
                  <Input placeholder="Email" type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} required />
                  <Input placeholder="Phone" value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} />
                  <Input placeholder="Initial password" type="password" minLength={8} value={employeeForm.password} onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })} required />
                </div>
                <select className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm" value={employeeForm.role} onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}>
                  <option value="sales_rep">Sales Representative</option>
                  <option value="sales_manager">Sales Manager</option>
                  <option value="logistics_manager">Logistics Manager</option>
                  <option value="admin">Administrator</option>
                </select>
                <Button disabled={busy}>Register employee</Button>
              </form>

              <form onSubmit={sendBroadcast} className="grid gap-2 border-t border-slate-800 pt-4">
                <div className="flex gap-2">
                  <select className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm" value={broadcast.audience} onChange={(e) => setBroadcast({ ...broadcast, audience: e.target.value })}>
                    <option value="all">All employees</option>
                    <option value="sales_rep">Sales representatives</option>
                    <option value="sales_manager">Sales managers</option>
                    <option value="logistics_manager">Logistics managers</option>
                    <option value="admin">Administrators</option>
                  </select>
                  <Button variant="secondary"><Megaphone className="mr-2 h-4 w-4" />Broadcast</Button>
                </div>
                <Input placeholder="Message" value={broadcast.message} onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })} required />
              </form>

              <div className="space-y-2 border-t border-slate-800 pt-4">
                {employees.slice(0, 8).map((employee) => (
                  <div key={employee.id} className="flex items-center justify-between rounded-md bg-slate-950 p-2 text-sm">
                    <span>{employee.full_name}<span className="ml-2 text-slate-500">{employee.employee_code}</span></span>
                    <Badge>{roleLabel(employee.role)}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Box; label: string; value: number | string }) {
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-100">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-orange-400/15 p-2 text-orange-300"><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-slate-400">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
