"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { EquityPoint } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface Props {
  data: EquityPoint[];
}

export function EquityChart({ data }: Props) {
  const positive = data.length > 0 && data[data.length - 1].equity >= data[0].equity;
  const stroke = positive ? "#10b981" : "#ef4444";

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.4} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            stroke="#71717a"
            fontSize={11}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            stroke="#71717a"
            fontSize={11}
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => `$${Math.round(v).toLocaleString()}`}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 6,
              color: "#e4e4e7",
              fontSize: 12,
            }}
            formatter={(v: number) => [formatCurrency(v), "Equity"]}
            labelStyle={{ color: "#a1a1aa" }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke={stroke}
            strokeWidth={2}
            fill="url(#equityFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
