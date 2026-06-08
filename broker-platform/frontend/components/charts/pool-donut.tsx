"use client";

import * as React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { PoolAllocation } from "@/lib/types";

interface Props {
  allocation: PoolAllocation;
}

const COLORS: Record<"A" | "B", string> = {
  A: "#10b981",
  B: "#f59e0b",
};

export function PoolDonut({ allocation }: Props) {
  const data = [
    { name: "Pool A", value: allocation.A },
    { name: "Pool B", value: allocation.B },
  ];
  return (
    <div className="relative h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            dataKey="value"
            stroke="#0a0a0a"
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={idx === 0 ? COLORS.A : COLORS.B} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 6,
              color: "#e4e4e7",
              fontSize: 12,
            }}
            formatter={(v: number) => [`${v}%`, ""]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xs text-zinc-400">A / B</div>
          <div className="text-sm font-semibold text-zinc-100">
            {allocation.A}% / {allocation.B}%
          </div>
        </div>
      </div>
    </div>
  );
}
