"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OddsChart } from "@/components/OddsChart";
import { TradePanel } from "@/components/TradePanel";
import { ExplainPanel } from "@/components/ExplainPanel";
import {
  markets as marketsApi,
  type MarketResponse,
  type PriceHistoryResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [history, setHistory] = useState<PriceHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMarket = async () => {
    if (!token) return;
    try {
      const [mkt, hist] = await Promise.all([
        marketsApi.get(token, id),
        marketsApi.history(token, id),
      ]);
      setMarket(mkt);
      setHistory(hist);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.push("/login"); return; }
    loadMarket();
  }, [authLoading, token, id]);

  if (loading || !market) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex items-center justify-center">
        <div className="animate-pulse text-[#00274C]/40">Loading forecast...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFBFD] relative">

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          <Link href="/student" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="w-px h-5 bg-[#00274C]/6" />
          <h1 className="text-lg font-semibold text-[#00274C] truncate">{market.title}</h1>
          <span className={`tag ${market.status === "live" ? "tag-emerald" : "tag-white"}`}>
            {market.status.toUpperCase()}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Chart + Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Forecast Info */}
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-[#00274C]">{market.title}</h2>
              {market.description && (
                <p className="text-sm text-[#00274C]/50 mt-1">{market.description}</p>
              )}
              <div className="flex gap-2 mt-2">
                <span className="tag tag-white">{market.market_type}</span>
                <span className="tag tag-white">b = {market.b_param}</span>
                <span className="tag tag-white">Max position: {market.max_position}</span>
              </div>
              <div className="space-y-3 mt-4">
                {market.outcomes.map((o) => (
                  <div key={o.id} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#00274C]">{o.label}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-[#00274C]/4 rounded-full h-3">
                        <div
                          className="bg-[#00274C] h-3 rounded-full transition-all"
                          style={{ width: `${Math.round(o.price * 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-[#00274C] w-14 text-right">
                        {(o.price * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Odds Chart */}
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#00274C] mb-4">Price History</h3>
              <OddsChart
                history={history?.history || []}
                outcomes={market.outcomes}
              />
            </div>

            {/* LMSR Explanation Panel */}
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#00274C] mb-3">How Pricing Works</h3>
              <div className="text-sm text-[#00274C]/50 space-y-2">
                <p>
                  This forecast uses the <strong className="text-[#00274C]/70">Logarithmic Market Scoring Rule (LMSR)</strong> for fair, automated pricing.
                  Prices reflect collective student beliefs about outcomes.
                </p>
                <p>
                  <strong className="text-[#00274C]/70">Buying</strong> shares of an outcome increases its price (probability).
                  <strong className="text-[#00274C]/70"> Selling</strong> decreases it. The LMSR spread is the only fee — no hidden costs.
                </p>
                <p>
                  The liquidity parameter <strong className="text-[#00274C]/70">b = {market.b_param}</strong> controls how much each trade moves the price.
                  Higher b means less price impact per trade.
                </p>
              </div>
            </div>

            {/* Explain button */}
            <ExplainPanel marketId={market.id} />
          </div>

          {/* Right: Trade Panel + Voice Room Link */}
          <div className="space-y-6">
            {market.status === "live" && (
              <TradePanel
                marketId={market.id}
                outcomes={market.outcomes}
                onTradeComplete={loadMarket}
              />
            )}

            {market.status !== "live" && (
              <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 text-center text-[#00274C]/40 shadow-sm">
                Trading is {market.status === "resolved" ? "closed — forecast resolved" : "not available"}
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
