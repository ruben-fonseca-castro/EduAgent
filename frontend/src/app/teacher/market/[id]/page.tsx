"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OddsChart } from "@/components/OddsChart";
import { SentimentBar } from "@/components/SentimentBar";
import {
  markets as marketsApi,
  voice as voiceApi,
  type MarketResponse,
  type SentimentResponse,
  type PriceHistoryResponse,
  type ClassInsightsResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function TeacherMarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [sentiment, setSentiment] = useState<SentimentResponse | null>(null);
  const [history, setHistory] = useState<PriceHistoryResponse | null>(null);
  const [insights, setInsights] = useState<ClassInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings
  const [editB, setEditB] = useState<number>(100);
  const [editMaxPos, setEditMaxPos] = useState<number>(500);
  const [editMaxDaily, setEditMaxDaily] = useState<number>(200);

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.push("/login"); return; }
    loadData();
  }, [authLoading, token, id]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const mkt = await marketsApi.get(token, id);
      setMarket(mkt);
      setEditB(mkt.b_param);
      setEditMaxPos(mkt.max_position);
      setEditMaxDaily(mkt.max_daily_spend);

      // Load additional data in parallel
      const promises: Promise<any>[] = [marketsApi.history(token, id)];
      if (mkt.status === "live") {
        promises.push(marketsApi.sentiment(token, id));
      }
      promises.push(voiceApi.insights(token, id).catch(() => null));

      const results = await Promise.all(promises);
      setHistory(results[0]);
      if (mkt.status === "live" && results[1]) setSentiment(results[1]);
      if (results[results.length - 1]) setInsights(results[results.length - 1]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!token) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await marketsApi.approve(token, id);
      setMarket(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      const updated = await marketsApi.pause(token, id);
      setMarket(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (outcomeId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to resolve this forecast? This cannot be undone.")) return;
    setActionLoading(true);
    try {
      const updated = await marketsApi.resolve(token, id, outcomeId);
      setMarket(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateSettings = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      const updated = await marketsApi.updateSettings(token, id, {
        b_param: editB,
        max_position: editMaxPos,
        max_daily_spend: editMaxDaily,
      });
      setMarket(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !market) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex items-center justify-center">
        <div className="animate-pulse text-[#00274C]/40">Loading forecast...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFBFD] relative">

      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/teacher" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="w-px h-5 bg-[#00274C]/6" />
          <h1 className="text-lg font-semibold text-[#00274C] truncate">{market.title}</h1>
          <span className={`tag ${market.status === "live" ? "tag-emerald" : market.status === "draft" ? "tag-white" : "tag-amber"}`}>
            {market.status.toUpperCase()}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6 relative">
        {error && (
          <div className="bg-[#D50032]/10 text-[#D50032] text-sm rounded-md p-3 border border-[#D50032]/20">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Forecast Info */}
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-[#00274C]">{market.title}</h2>
              {market.description && (
                <p className="text-sm text-[#00274C]/50">{market.description}</p>
              )}
              <div className="space-y-2 mt-4">
                {market.outcomes.map((o) => (
                  <div key={o.id} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#00274C]">{o.label}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-[#00274C]/4 rounded-full h-3">
                        <div
                          className="bg-[#00274C] h-3 rounded-full"
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

            {/* Sentiment */}
            {sentiment && (
              <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-[#00274C] mb-4">Student Sentiment</h3>
                <SentimentBar sentiment={sentiment} />
              </div>
            )}

            {/* Odds Chart */}
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#00274C] mb-4">Price History</h3>
              <OddsChart history={history?.history || []} outcomes={market.outcomes} />
            </div>

            {/* Voice Insights */}
            {insights && insights.misconceptions.length > 0 && (
              <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-[#00274C] mb-1">Class Misconceptions (Aggregated)</h3>
                <p className="text-xs text-[#00274C]/25 mb-4">
                  Privacy-preserving: shows aggregated insights from {insights.participation_count} voice sessions
                </p>
                <ul className="space-y-1">
                  {insights.misconceptions.map((m, i) => (
                    <li key={i} className="text-sm text-[#00274C]/70 flex items-start gap-2">
                      <span className="text-yellow-500 mt-0.5">!</span>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right column: Actions + Settings */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-4">Actions</h3>
              <div className="space-y-3">
                {(market.status === "draft" || market.status === "pending") && (
                  <button onClick={handleApprove} disabled={actionLoading} className="btn-primary w-full">
                    Approve &amp; Go Live
                  </button>
                )}
                {market.status === "live" && (
                  <>
                    <button onClick={handlePause} disabled={actionLoading} className="btn-ghost w-full">
                      Pause Forecast
                    </button>
                    <div className="border-t border-[#00274C]/6 pt-3">
                      <p className="text-sm font-medium text-[#00274C]/70 mb-2">Resolve Forecast</p>
                      <p className="text-xs text-[#00274C]/25 mb-2">Select the winning outcome:</p>
                      {market.outcomes.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => handleResolve(o.id)}
                          disabled={actionLoading}
                          className="btn-ghost w-full mb-1 text-sm text-left"
                        >
                          Resolve: {o.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {market.status === "resolved" && (
                  <div className="text-center text-sm text-[#00274C]/50">
                    Forecast resolved. Winner:{" "}
                    <strong className="text-[#00274C]/70">{market.outcomes.find((o) => o.id === market.resolved_outcome_id)?.label}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Settings */}
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-4">Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[#00274C]/50">Liquidity (b)</label>
                  <input
                    type="number"
                    value={editB}
                    onChange={(e) => setEditB(Number(e.target.value))}
                    className="input-dark mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#00274C]/50">Max Position</label>
                  <input
                    type="number"
                    value={editMaxPos}
                    onChange={(e) => setEditMaxPos(Number(e.target.value))}
                    className="input-dark mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#00274C]/50">Max Daily Spend</label>
                  <input
                    type="number"
                    value={editMaxDaily}
                    onChange={(e) => setEditMaxDaily(Number(e.target.value))}
                    className="input-dark mt-1 w-full"
                  />
                </div>
                <button onClick={handleUpdateSettings} disabled={actionLoading} className="btn-ghost w-full text-sm">
                  Save Settings
                </button>
              </div>
            </div>

            {/* Audit info */}
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-3">Audit Trail</h3>
              <div className="text-xs text-[#00274C]/25 space-y-1">
                <p>Created: {new Date(market.created_at).toLocaleString()}</p>
                {market.approved_at && <p>Approved: {new Date(market.approved_at).toLocaleString()}</p>}
                {market.live_at && <p>Went live: {new Date(market.live_at).toLocaleString()}</p>}
                {market.resolved_at && <p>Resolved: {new Date(market.resolved_at).toLocaleString()}</p>}
                <p className="mt-2">Resolution source: {market.resolution_source}</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
