import Link from "next/link";
import { ArrowRight, TrendingUp, Shield, Zap, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-7 w-7 rounded-md bg-emerald-500" />
            <span>Broker</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.15),transparent_60%)]" />
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <Zap className="h-3 w-3" /> Dual-pool PAMM, fully automated
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
              Put your capital to work —
              <span className="block text-emerald-400">let our EAs trade it.</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-zinc-300">
              A proportional share of two FBS master accounts running signal-driven and
              WickReversal strategies. Pick a plan, choose your duration (3 days minimum),
              and watch your share of the pool&apos;s PnL accrue in real time.
            </p>
            <div className="mt-10 flex items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/register">
                  Start investing <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/login">I already have an account</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            icon={<TrendingUp className="h-5 w-5" />}
            title="Two strategies, one platform"
            desc="Pool A executes partner signals. Pool B runs our in-house WickReversalBot v7 on XAUUSD."
          />
          <Feature
            icon={<Shield className="h-5 w-5" />}
            title="HMAC-signed EA bridge"
            desc="Every trade and signal is HMAC-SHA256 authenticated. FBS credentials AES-256-GCM encrypted at rest."
          />
          <Feature
            icon={<BarChart3 className="h-5 w-5" />}
            title="Real-time PnL"
            desc="Your share of the pool updates per closed trade. 70/30 on Normal, 80/20 on Pro."
          />
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title="3-day minimum"
            desc="Capital is locked until the end of your chosen duration. Pause anytime, withdraw at unlock."
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Two plans. One platform.</CardTitle>
            <CardDescription>Pick what fits your risk and capital.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-sky-700/40 bg-sky-900/10 p-5">
              <h3 className="text-lg font-semibold text-sky-300">Normal</h3>
              <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                <li>• Min deposit: <span className="font-semibold">$100</span></li>
                <li>• Profit split: <span className="font-semibold">70 / 30</span></li>
                <li>• Defaults to Pool A (signals, multi-pair)</li>
              </ul>
            </div>
            <div className="rounded-lg border border-amber-700/40 bg-amber-900/10 p-5">
              <h3 className="text-lg font-semibold text-amber-300">Pro</h3>
              <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                <li>• Min deposit: <span className="font-semibold">$1,000</span></li>
                <li>• Profit split: <span className="font-semibold">80 / 20</span></li>
                <li>• Defaults to BOTH pools (toggleable)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        © {new Date().getFullYear()} Broker Platform. All trading carries risk.
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300">
          {icon}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
    </Card>
  );
}
