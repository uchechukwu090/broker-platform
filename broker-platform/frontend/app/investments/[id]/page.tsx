"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { SiteShell } from "@/components/site-shell";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { PoolDonut } from "@/components/charts/pool-donut";
import { PnlBar } from "@/components/charts/pnl-bar";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Investment, PoolAllocation, Trade } from "@/lib/types";

export default function InvestmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();
  const { user } = useAuth();

  const [inv, setInv] = React.useState<Investment | null>(null);
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [toggleOpen, setToggleOpen] = React.useState(false);
  const [toggleAlloc, setToggleAlloc] = React.useState<PoolAllocation>({ A: 50, B: 50 });

  const refresh = React.useCallback(async () => {
    if (!id) return;
    try {
      const [i, t] = await Promise.all([
        api.getInvestment(id),
        api.listTradesForInvestment(id),
      ]);
      if (!i) {
        setError("Investment not found");
        return;
      }
      setInv(i);
      setTrades(t);
      setToggleAlloc(i.poolAllocation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [id]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  if (error) {
    return (
      <SiteShell>
        <Alert variant="danger">{error}</Alert>
      </SiteShell>
    );
  }
  if (!inv) {
    return (
      <SiteShell>
        <p className="text-sm text-zinc-400">Loading…</p>
      </SiteShell>
    );
  }

  const unlocked = new Date(inv.endDate).getTime() <= Date.now();
  const canTogglePools = inv.plan === "Pro" || user?.role === "owner";

  async function handlePause() {
    setBusy(true);
    try {
      await api.pauseInvestment(inv!.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function handleResume() {
    setBusy(true);
    try {
      await api.resumeInvestment(inv!.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function handleWithdraw() {
    if (!unlocked) return;
    setBusy(true);
    try {
      await api.requestWithdraw(inv!.id);
      router.push("/wallet");
    } finally {
      setBusy(false);
    }
  }
  async function handleToggleSave() {
    setBusy(true);
    try {
      await api.togglePools(inv!.id, toggleAlloc);
      setToggleOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const totalPnl = inv.realizedPnl + inv.unrealizedPnl;

  return (
    <SiteShell>
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Investment <span className="text-zinc-500">#{inv.id}</span>
            </h1>
            <p className="text-sm text-zinc-400">
              {formatDateTime(inv.startDate)} → {formatDateTime(inv.endDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={inv.plan === "Pro" ? "pro" : "normal"}>{inv.plan}</Badge>
            <Badge
              variant={
                inv.status === "active"
                  ? "default"
                  : inv.status === "paused"
                    ? "warning"
                    : "muted"
              }
            >
              {inv.status}
            </Badge>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Capital" value={formatCurrency(inv.amount)} />
          <Stat
            label="Current equity"
            value={formatCurrency(inv.currentEquity)}
            tone={inv.currentEquity >= inv.amount ? "pos" : "neg"}
          />
          <Stat
            label="Total PnL"
            value={formatCurrency(totalPnl)}
            tone={totalPnl >= 0 ? "pos" : "neg"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>PnL per trade</CardTitle>
              <CardDescription>Closed trades for this investment.</CardDescription>
            </CardHeader>
            <CardContent>
              {trades.length === 0 ? (
                <p className="text-sm text-zinc-400">No trades yet.</p>
              ) : (
                <PnlBar trades={trades} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pool split</CardTitle>
              <CardDescription>Where your capital is trading.</CardDescription>
            </CardHeader>
            <CardContent>
              <PoolDonut allocation={inv.poolAllocation} />
              {canTogglePools && (
                <Dialog open={toggleOpen} onOpenChange={setToggleOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="mt-2 w-full">
                      Toggle pools
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Reallocate pools</DialogTitle>
                      <DialogDescription>
                        Move capital between Pool A and Pool B. Must sum to 100%.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Pool A %</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={toggleAlloc.A}
                          onChange={(e) => {
                            const a = Math.max(0, Math.min(100, Number(e.target.value)));
                            setToggleAlloc({ A: a, B: 100 - a });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Pool B %</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={toggleAlloc.B}
                          onChange={(e) => {
                            const b = Math.max(0, Math.min(100, Number(e.target.value)));
                            setToggleAlloc({ A: 100 - b, B: b });
                          }}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setToggleOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleToggleSave} disabled={busy}>
                        Save reallocation
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Trades</CardTitle>
            <CardDescription>All trades linked to this investment.</CardDescription>
          </CardHeader>
          <CardContent>
            {trades.length === 0 ? (
              <p className="text-sm text-zinc-400">No trades yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pool</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Lot</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Close</TableHead>
                    <TableHead className="text-right">PnL</TableHead>
                    <TableHead>Closed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Badge variant="muted">{t.poolId}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{t.symbol}</TableCell>
                      <TableCell>
                        <Badge variant={t.type === "buy" ? "default" : "warning"}>
                          {t.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{t.lotSize}</TableCell>
                      <TableCell className="text-right font-mono">{t.openPrice}</TableCell>
                      <TableCell className="text-right font-mono">
                        {t.closePrice ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          t.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatCurrency(t.pnl)}
                      </TableCell>
                      <TableCell className="text-zinc-400">
                        {t.closedAt ? formatDateTime(t.closedAt) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          {inv.status === "active" ? (
            <Button variant="secondary" onClick={handlePause} disabled={busy}>
              Pause bots
            </Button>
          ) : inv.status === "paused" ? (
            <Button onClick={handleResume} disabled={busy}>
              Resume bots
            </Button>
          ) : null}
          <Button
            variant={unlocked ? "default" : "outline"}
            disabled={!unlocked || busy}
            onClick={handleWithdraw}
          >
            {unlocked ? "Request withdrawal" : "Locked until endDate"}
          </Button>
        </div>
      </div>
    </SiteShell>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  const cls =
    tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : "text-zinc-100";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
