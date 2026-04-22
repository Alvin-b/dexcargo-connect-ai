import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plane, Ship, Zap, MessageCircle, Shield, MapPin } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Dexcargo — Ship from China to Anywhere" },
      { name: "description", content: "Air, sea and express freight from China. Live tracking, M-Pesa payments, 24/7 WhatsApp AI support." },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold text-primary">Dexcargo</div>
          <nav className="flex gap-4 items-center">
            <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
            <Link to="/auth"><Button>Get started</Button></Link>
          </nav>
        </div>
      </header>
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight">Ship from China to your door</h1>
        <p className="text-xl text-muted-foreground mt-4 max-w-2xl mx-auto">Air, sea and express freight powered by an AI agent that handles your entire shipment over WhatsApp.</p>
        <div className="mt-8 flex gap-3 justify-center">
          <Link to="/auth"><Button size="lg">Track a package</Button></Link>
          <Link to="/quote"><Button size="lg" variant="secondary">Get instant quote</Button></Link>
          <Button size="lg" variant="outline" asChild><a href="https://wa.me/" target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-2" />Chat on WhatsApp</a></Button>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-3 gap-4">
        {[
          { icon: Plane, title: "Air freight", desc: "Fast door-to-door from Guangzhou, Shenzhen, Shanghai." },
          { icon: Ship, title: "Sea freight", desc: "Affordable per-CBM rates for bulk cargo." },
          { icon: Zap, title: "Express", desc: "Time-critical shipments with priority handling." },
        ].map((f) => (
          <Card key={f.title}><CardContent className="p-6">
            <f.icon className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold text-lg">{f.title}</h3>
            <p className="text-muted-foreground mt-1">{f.desc}</p>
          </CardContent></Card>
        ))}
      </section>
      <section className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-3 gap-4">
        {[
          { icon: MessageCircle, title: "WhatsApp AI", desc: "Our AI agent answers 24/7, knows your packages and rates." },
          { icon: MapPin, title: "Real-time tracking", desc: "Photo on arrival in China, status updates at every step." },
          { icon: Shield, title: "Pay with M-Pesa", desc: "Secure STK push direct from your phone." },
        ].map((f) => (
          <div key={f.title} className="text-center">
            <f.icon className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-muted-foreground text-sm mt-1">{f.desc}</p>
          </div>
        ))}
      </section>
      <footer className="border-t mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-muted-foreground flex justify-between">
          <div>© {new Date().getFullYear()} Dexcargo</div>
          <div>China → Worldwide</div>
        </div>
      </footer>
    </div>
  );
}
