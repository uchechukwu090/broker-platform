"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import type { Trade } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface Props {
  trades: Trade[];
}

export function PnlBar({ trades }: Props) {
  const data = trades.map((t, idx) => ({
    name: `#${idx + 1} ${t.symbol}`,
    pnl: t.pnl,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis dataKey="name" stroke="#71717a" fontSize={10} />
          <YAxis
            stroke="#71717a"
            fontSize={11}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 6,
              color: "#e4e4e7",
              fontSize: 12,
            }}
            formatter={(v: number) => [formatCurrency(v), "PnL"]}
          />
          <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.pnl >= 0 ? "#10b981" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
