"use client";

import Link from "next/link";
import type { MarketResponse } from "@/lib/api";

const STATUS_CONFIG: Record<string, { label: string; class: string; dot: string }> = {
  draft: { label: "DRAFT", class: "tag-white", dot: "bg-[#00274C]/30" },
  pending: { label: "PENDING", class: "tag-amber", dot: "bg-amber-500" },
  live: { label: "LIVE", class: "tag-emerald", dot: "bg-emerald-500 animate-pulse" },
  resolved: { label: "RESOLVED", class: "tag-indigo", dot: "bg-[#00274C]" },
  settled: { label: "SETTLED", class: "tag-white", dot: "bg-[#00274C]/20" },
};

const TYPE_LABELS: Record<string, string> = {
  concept: "Concept",
  deadline: "Deadline",
  wellbeing: "Well-being",
};

interface MarketCardProps {
  market: MarketResponse;
  href: string;
}

export function MarketCard({ market, href }: MarketCardProps) {
  const status = STATUS_CONFIG[market.status] || STATUS_CONFIG.draft;

  return (
    <Link href={href}>
      <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 cursor-pointer group h-full shadow-sm hover:shadow-md transition-all">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className={`tag ${status.class}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          <span className="text-[10px] text-[#00274C]/30 font-medium">
            {TYPE_LABELS[market.market_type] || market.market_type}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-[#00274C] mb-1 leading-snug group-hover:text-[#00274C]/80 transition-colors">
          {market.title}
        </h3>
        {market.description && (
          <p className="text-xs text-[#00274C]/40 line-clamp-2 mb-4 leading-relaxed">{market.description}</p>
        )}

        {/* Outcomes */}
        <div className="space-y-2.5">
          {market.outcomes.map((outcome) => {
            const pct = Math.round(outcome.price * 100);
            return (
              <div key={outcome.id} className="group/outcome">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#00274C]/50">{outcome.label}</span>
                  <span className="text-xs font-bold text-[#00274C]/70 tabular-nums">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#00274C]/4 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#00274C] to-[#1B365D] transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
}
