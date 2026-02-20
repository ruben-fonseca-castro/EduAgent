"use client";

import type { SentimentResponse } from "@/lib/api";

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed"];

interface SentimentBarProps {
  sentiment: SentimentResponse;
}

export function SentimentBar({ sentiment }: SentimentBarProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Student Sentiment</h3>
      {/* Stacked bar */}
      <div className="w-full h-8 rounded-full overflow-hidden flex">
        {sentiment.outcomes.map((o, i) => (
          <div
            key={o.id}
            className="h-full transition-all flex items-center justify-center text-white text-xs font-medium"
            style={{
              width: `${o.percentage}%`,
              backgroundColor: COLORS[i % COLORS.length],
              minWidth: o.percentage > 5 ? undefined : "0px",
            }}
          >
            {o.percentage > 10 && `${o.percentage}%`}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {sentiment.outcomes.map((o, i) => (
          <div key={o.id} className="flex items-center gap-1.5 text-sm">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-gray-600">{o.label}</span>
            <span className="font-medium">{o.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
