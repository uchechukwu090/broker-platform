"use client";

import * as React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import type { PoolAllocation } from "@/lib/types";

interface Props {
  allocation: PoolAllocation;
}

const COLORS: Record<"A" | "B", string> = {
  A: "#10b981",
  B: "#f59e0b",
};

export function PoolPie({ allocation }: Props) {
  const data = React.useMemo(
    () => [
      { name: "Pool A — Signals", value: allocation.A },
      { name: "Pool B — WickBot", value: allocation.B },
    ],
    [allocation],
  );

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
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
            formatter={(v: number) => [`${v}%`, "Allocation"]}
          />
          <Legend
            wrapperStyle={{ color: "#a1a1aa", fontSize: 12 }}
            iconType="circle"
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
