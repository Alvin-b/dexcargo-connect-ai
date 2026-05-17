import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Package as PackageIcon, Plus } from "lucide-react";
import { updatePackageStatus, adminInitiatePayment } from "@/lib/notify.functions";

const STATUSES = [
  "pending",
  "received_in_china",
  "processing",
  "in_transit",
  "arrived_destination",
  "out_for_delivery",
  "delivered",
  "on_hold",
  "cancelled",
];

export const Route = createFileRoute("/dashboard/packages")({ component: PackagesPage });

function PackagesPage() {
  const qc = useQueryClient();
  const updateFn = useServerFn(updatePackageStatus);
  const payFn = useServerFn(adminInitiatePayment);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () =>
      (await supabase.from("clients").select("id, full_name, whatsapp_number").order("full_name"))
        .data ?? [],
  });
  const { data: packages } = useQuery({
    queryKey: ["packages", search],
    queryFn: async () => {
      let q = supabase
        .from("packages")
        .select("*, clients(full_name, whatsapp_number)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (search) q = q.ilike("tracking_number", `%${search}%`);
      return (await q).data ?? [];
    },
  });

  const [form, setForm] = useState({
    tracking_number: "",
    client_id: "",
    sender_name: "",
    sender_phone: "",
    description: "",
    weight_kg: "",
    destination_country: "",
    destination_city: "",
    mode: "air",
    shipping_cost: "",
    warehouse_photo_url: "",
  });
  const [intakeUploading, setIntakeUploading] = useState(false);
  async function createPkg() {
    if (!form.tracking_number) return toast.error("Tracking number is required");
    if (!form.warehouse_photo_url) return toast.error("Warehouse photo is required");
    if (!form.client_id && !form.sender_name && !form.sender_phone) {
      return toast.error("Provide at least a client, sender name, or sender phone");
    }
    const { error } = await supabase.from("packages").insert({
      tracking_number: form.tracking_number,
      client_id: form.client_id || null,
      sender_name: form.sender_name || null,
      sender_phone: form.sender_phone ? form.sender_phone.replace(/\D/g, "") : null,
      description: form.description || null,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      destination_country: form.destination_country || null,
      destination_city: form.destination_city || null,
      mode: form.mode as any,
      shipping_cost: form.shipping_cost ? Number(form.shipping_cost) : null,
      warehouse_photo_url: form.warehouse_photo_url,
      status: "pending",
    });
    if (error) return toast.error(error.message);
    toast.success("Package created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["packages"] });
  }

  async function uploadIntakePhoto(file: File) {
    setIntakeUploading(true);
    const path = `intake/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from("package-photos")
      .upload(path, file, { upsert: true });
    setIntakeUploading(false);
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("package-photos").getPublicUrl(path);
    setForm((f) => ({ ...f, warehouse_photo_url: data.publicUrl }));
    toast.success("Photo uploaded");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Packages</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              New package
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create package</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Tracking number *</Label>
                <Input
                  value={form.tracking_number}
                  onChange={(e) => setForm({ ...form, tracking_number: e.target.value })}
                />
              </div>
              <div>
                <Label>Warehouse photo *</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files && uploadIntakePhoto(e.target.files[0])}
                  disabled={intakeUploading}
                />
                {form.warehouse_photo_url && (
                  <img
                    src={form.warehouse_photo_url}
                    className="h-24 mt-2 rounded object-cover"
                    alt="warehouse"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Sender name</Label>
                  <Input
                    value={form.sender_name}
                    onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Sender phone</Label>
                  <Input
                    value={form.sender_phone}
                    onChange={(e) => setForm({ ...form, sender_phone: e.target.value })}
                    placeholder="2547..."
                  />
                </div>
              </div>
              <div>
                <Label>Existing client (optional)</Label>
                <Select
                  value={form.client_id}
                  onValueChange={(v) => setForm({ ...form, client_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name} — {c.whatsapp_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Weight (kg)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.weight_kg}
                    onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Mode</Label>
                  <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="air">Air</SelectItem>
                      <SelectItem value="sea">Sea</SelectItem>
                      <SelectItem value="express">Express</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Destination country</Label>
                  <Input
                    value={form.destination_country}
                    onChange={(e) => setForm({ ...form, destination_country: e.target.value })}
                  />
                </div>
                <div>
                  <Label>City</Label>
                  <Input
                    value={form.destination_city}
                    onChange={(e) => setForm({ ...form, destination_city: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Shipping cost (KES)</Label>
                  <Input
                    type="number"
                    value={form.shipping_cost}
                    onChange={(e) => setForm({ ...form, shipping_cost: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={createPkg} className="w-full">
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Input
        placeholder="Search tracking number…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="grid gap-3">
        {packages?.map((p: any) => (
          <PackageRow
            key={p.id}
            pkg={p}
            onUpdate={async (status, photoUrl, location, notes) => {
              try {
                await updateFn({ data: { packageId: p.id, status, photoUrl, location, notes } });
                toast.success("Status updated, client notified");
                qc.invalidateQueries({ queryKey: ["packages"] });
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
            onPay={async (phone, amount) => {
              try {
                await payFn({ data: { packageId: p.id, phone, amount } });
                toast.success("STK push sent");
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          />
        ))}
        {!packages?.length && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <PackageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No packages yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function PackageRow({
  pkg,
  onUpdate,
  onPay,
}: {
  pkg: any;
  onUpdate: (s: string, photoUrl?: string, location?: string, notes?: string) => void;
  onPay: (phone: string, amount: number) => void;
}) {
  const [status, setStatus] = useState(pkg.status);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [phone, setPhone] = useState(pkg.clients?.whatsapp_number ?? "");
  const [amount, setAmount] = useState(pkg.shipping_cost ?? 0);

  async function uploadPhoto(file: File) {
    setUploading(true);
    const path = `${pkg.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from("package-photos")
      .upload(path, file, { upsert: true });
    setUploading(false);
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("package-photos").getPublicUrl(path);
    setPhotoUrl(data.publicUrl);
    toast.success("Photo uploaded");
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono font-semibold">{pkg.tracking_number}</div>
            <div className="text-sm text-muted-foreground">
              {pkg.clients?.full_name} • {pkg.clients?.whatsapp_number}
            </div>
            <div className="text-sm">{pkg.description}</div>
          </div>
          <Badge>{pkg.status.replace(/_/g, " ")}</Badge>
        </div>
        {pkg.warehouse_photo_url && (
          <img
            src={pkg.warehouse_photo_url}
            className="h-32 rounded-md object-cover"
            alt="warehouse"
          />
        )}
        <div className="grid md:grid-cols-4 gap-2 items-end">
          <div className="md:col-span-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files && uploadPhoto(e.target.files[0])}
            className="max-w-xs"
            disabled={uploading}
          />
          {photoUrl && <span className="text-xs text-green-600">Photo ready</span>}
          <Button
            size="sm"
            onClick={() => onUpdate(status, photoUrl, location || undefined, notes || undefined)}
          >
            Update & notify client
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 items-end pt-2 border-t">
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Amount KES</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-32"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={() => onPay(phone, amount)}>
            Send STK push
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
