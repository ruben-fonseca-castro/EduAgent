"use client";

import type { PortfolioResponse } from "@/lib/api";

interface PortfolioSummaryProps {
  portfolio: PortfolioResponse | null;
  loading: boolean;
}

export function PortfolioSummary({ portfolio, loading }: PortfolioSummaryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 animate-pulse shadow-sm">
            <div className="h-8 bg-[#00274C]/5 rounded-lg mb-2" />
            <div className="h-3 bg-[#00274C]/3 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (!portfolio) return null;

  const totalPnl = portfolio.positions.reduce((sum, p) => sum + p.pnl, 0);

  const stats = [
    { value: portfolio.blue_coins.toFixed(0), label: "Blue Coins", icon: "🪙", color: "text-[#00274C]" },
    { value: portfolio.total_invested.toFixed(0), label: "Invested", icon: "📊", color: "text-[#00274C]/70" },
    { value: `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(1)}`, label: "Total Delta", icon: "📈", color: totalPnl >= 0 ? "text-emerald-600" : "text-[#D50032]" },
    { value: portfolio.positions.length.toString(), label: "Positions", icon: "🎯", color: "text-[#00274C]/70" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat, i) => (
        <div key={i} className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">{stat.icon}</span>
            <span className="text-[10px] text-[#00274C]/30 uppercase tracking-wider font-semibold">{stat.label}</span>
          </div>
          <p className={`text-2xl font-bold ${stat.color} tabular-nums`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
