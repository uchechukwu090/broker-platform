"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Investment } from "@/lib/types";

const STATUS_VARIANT: Record<
  Investment["status"],
  "default" | "warning" | "danger" | "muted"
> = {
  active: "default",
  paused: "warning",
  withdrawn: "muted",
  completed: "muted",
};

export default function InvestmentsListPage() {
  const [items, setItems] = React.useState<Investment[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    api
      .listInvestments()
      .then((d) => mounted && setItems(d))
      .catch((e) => mounted && setError(e instanceof Error ? e.message : "Failed"));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SiteShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Investments</h1>
            <p className="text-sm text-zinc-400">All your active and past investments.</p>
          </div>
          <Button asChild size="sm">
            <Link href="/invest">New investment</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All</CardTitle>
          </CardHeader>
          <CardContent>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!items && !error && (
              <p className="text-sm text-zinc-400">Loading…</p>
            )}
            {items && items.length === 0 && (
              <p className="text-sm text-zinc-400">
                No investments yet.{" "}
                <Link href="/invest" className="text-emerald-400 hover:underline">
                  Open one
                </Link>
                .
              </p>
            )}
            {items && items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead className="text-right">Equity</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Badge variant={i.plan === "Pro" ? "pro" : "normal"}>
                          {i.plan}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(i.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[i.status]}>{i.status}</Badge>
                      </TableCell>
                      <TableCell className="text-zinc-400">
                        {formatDate(i.startDate)}
                      </TableCell>
                      <TableCell className="text-zinc-400">
                        {formatDate(i.endDate)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          i.currentEquity >= i.amount ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatCurrency(i.currentEquity)}
                      </TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/investments/${i.id}`}>
                            Open <ArrowRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </SiteShell>
  );
}
