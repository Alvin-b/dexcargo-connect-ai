import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { quoteShipping } from "@/lib/notify.functions";
import { Plane, Ship, Zap, Calculator } from "lucide-react";

export const Route = createFileRoute("/quote")({
  component: QuotePage,
  head: () => ({
    meta: [
      { title: "Shipping Quote — Dexcargo" },
      {
        name: "description",
        content: "Calculate the cost of shipping your cargo from China by air, sea or express.",
      },
    ],
  }),
});

function QuotePage() {
  const quote = useServerFn(quoteShipping);
  const [mode, setMode] = useState<"air" | "sea" | "express">("air");
  const [country, setCountry] = useState("Kenya");
  const [category, setCategory] = useState("");
  const [weight, setWeight] = useState("");
  const [cbm, setCbm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function calc() {
    setBusy(true);
    try {
      const r = await quote({
        data: {
          destinationCountry: country,
          mode,
          category: category || undefined,
          weightKg: weight ? Number(weight) : undefined,
          cbm: cbm ? Number(cbm) : undefined,
        },
      });
      setResult(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between">
          <Link to="/" className="text-2xl font-bold text-primary">
            Dexcargo
          </Link>
          <Link to="/auth">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <Calculator className="h-10 w-10 text-primary mx-auto mb-3" />
          <h1 className="text-3xl font-bold">Shipping Quote</h1>
          <p className="text-muted-foreground mt-1">Estimate the cost of shipping from China.</p>
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              {(
                [
                  { v: "air", label: "Air", icon: Plane },
                  { v: "sea", label: "Sea", icon: Ship },
                  { v: "express", label: "Express", icon: Zap },
                ] as const
              ).map((m) => (
                <button
                  key={m.v}
                  type="button"
                  onClick={() => setMode(m.v)}
                  className={`border rounded-md p-3 flex flex-col items-center gap-1 transition ${mode === m.v ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                >
                  <m.icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{m.label}</span>
                </button>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Destination country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kenya">Kenya</SelectItem>
                    <SelectItem value="Uganda">Uganda</SelectItem>
                    <SelectItem value="Tanzania">Tanzania</SelectItem>
                    <SelectItem value="Rwanda">Rwanda</SelectItem>
                    <SelectItem value="South Sudan">South Sudan</SelectItem>
                    <SelectItem value="Ethiopia">Ethiopia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category (optional)</Label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. electronics, clothing"
                />
              </div>
              {mode !== "sea" && (
                <div>
                  <Label>Weight (kg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="e.g. 25"
                  />
                </div>
              )}
              {mode === "sea" && (
                <div>
                  <Label>Volume (CBM)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={cbm}
                    onChange={(e) => setCbm(e.target.value)}
                    placeholder="e.g. 1.5"
                  />
                </div>
              )}
            </div>
            <Button onClick={calc} disabled={busy} size="lg" className="w-full">
              {busy ? "Calculating…" : "Get quote"}
            </Button>
            {result && (
              <div
                className={`rounded-md p-4 ${result.ok ? "bg-primary/5 border border-primary/20" : "bg-destructive/5 border border-destructive/20"}`}
              >
                {result.ok ? (
                  <>
                    <div className="text-sm text-muted-foreground">Estimated cost</div>
                    <div className="text-3xl font-bold">
                      {result.currency} {result.cost.toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{result.message}</div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Final cost may vary based on actual weight, volume and customs. Contact us on
                      WhatsApp to confirm.
                    </p>
                  </>
                ) : (
                  <div className="text-sm">{result.message}</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
