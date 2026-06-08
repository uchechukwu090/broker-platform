import { redirect } from "next/navigation";
import { api } from "@/lib/api/client";
import { SiteShell } from "@/components/site-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EquityChart } from "@/components/charts/equity-chart";
import { PoolPie } from "@/components/charts/pool-pie";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, TrendingUp, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data;
  try {
    data = await api.getDashboard();
  } catch {
    redirect("/login");
  }

  const pnlPositive = data.pnlToday >= 0;
  const planVariant = data.plan === "Pro" ? "pro" : "normal";

  return (
    <SiteShell>
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-zinc-400">
              Welcome back, {data.user.email}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={planVariant}>{data.plan} plan</Badge>
            <Button asChild size="sm">
              <Link href="/invest">
                <TrendingUp className="h-4 w-4" />
                New investment
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="PnL today"
            value={formatCurrency(data.pnlToday)}
            positive={pnlPositive}
            icon={<ArrowUpRight className="h-4 w-4" />}
          />
          <StatCard
            label="Active investments"
            value={String(data.activeInvestments)}
            positive
            icon={<Wallet className="h-4 w-4" />}
          />
          <StatCard
            label="Days until unlock"
            value={String(data.daysUntilUnlock)}
            positive
            icon={<CalendarClock className="h-4 w-4" />}
            subline={
              data.nextUnlockDate
                ? `Next: ${formatDate(data.nextUnlockDate)}`
                : "No active lock"
            }
          />
          <StatCard
            label="Pool A / B"
            value={`${data.poolAllocation.A}% / ${data.poolAllocation.B}%`}
            positive
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Equity curve</CardTitle>
              <CardDescription>Last 30 days.</CardDescription>
            </CardHeader>
            <CardContent>
              <EquityChart data={data.equityCurve} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pool allocation</CardTitle>
              <CardDescription>Current split across strategies.</CardDescription>
            </CardHeader>
            <CardContent>
              <PoolPie allocation={data.poolAllocation} />
            </CardContent>
          </Card>
        </div>
      </div>
    </SiteShell>
  );
}

function StatCard({
  label,
  value,
  positive,
  icon,
  subline,
}: {
  label: string;
  value: string;
  positive: boolean;
  icon: React.ReactNode;
  subline?: string;
}) {
  const colorClass = positive ? "text-emerald-400" : "text-red-400";
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-400">
          <span>{label}</span>
          <span className="text-zinc-500">{icon}</span>
        </div>
        <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
        {subline && <div className="text-xs text-zinc-500">{subline}</div>}
      </CardContent>
    </Card>
  );
}
