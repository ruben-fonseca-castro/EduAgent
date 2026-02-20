"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { PriceHistoryResponse, OutcomeResponse } from "@/lib/api";

const COLORS = ["#00274C", "#D50032", "#FFCB05", "#059669", "#7c3aed", "#0891b2"];

interface OddsChartProps {
  history: PriceHistoryResponse["history"];
  outcomes: OutcomeResponse[];
}

export function OddsChart({ history, outcomes }: OddsChartProps) {
  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-400 text-sm">No trading history yet. Prices will appear here after the first trade.</p>
      </div>
    );
  }

  // Transform data: each point has timestamp + outcome prices
  const data = history.map((point) => {
    const row: Record<string, string | number> = {
      time: new Date(point.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    for (const outcome of outcomes) {
      const price = point.prices[outcome.id];
      if (price !== undefined) {
        row[outcome.label] = Math.round(price * 1000) / 10; // Show as percentage
      }
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
        <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, ""]} />
        <Legend />
        {outcomes.map((outcome, i) => (
          <Line
            key={outcome.id}
            type="monotone"
            dataKey={outcome.label}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
