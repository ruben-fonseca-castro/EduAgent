"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MarketCard } from "@/components/MarketCard";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import {
  markets as marketsApi,
  trades as tradesApi,
  classes as classesApi,
  type MarketResponse,
  type PortfolioResponse,
  type ClassResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { studentTutorialSteps } from "@/lib/tutorialSteps";

const TutorialOverlay = dynamic(() => import("@/components/TutorialOverlay"), { ssr: false });

export default function StudentDashboard() {
  const router = useRouter();
  const { token, user, logout, isLoading: authLoading } = useAuth();
  const [marketList, setMarketList] = useState<MarketResponse[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [classList, setClassList] = useState<ClassResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("live");
  const [inviteCode, setInviteCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!token || !user) { router.push("/login"); return; }
    if (user.role !== "student") { router.push("/teacher"); return; }
    loadData();
  }, [authLoading, token, user, filter]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [mktData, portfolioData, classData] = await Promise.all([
        marketsApi.list(token, { status: filter || undefined }),
        tradesApi.portfolio(token),
        classesApi.list(token),
      ]);
      setMarketList(mktData.markets);
      setPortfolio(portfolioData);
      setClassList(classData.classes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinClass = async () => {
    if (!token || !inviteCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      await classesApi.join(token, { invite_code: inviteCode.trim().toUpperCase() });
      setInviteCode("");
      loadData();
    } catch (e: any) {
      setJoinError(e.message);
    } finally {
      setJoining(false);
    }
  };

  if (!user) return null;

  // Show tutorial for demo student accounts (demo.student1@astra.edu, etc.)
  const showTutorial = user?.email?.includes("demo") && user?.email?.includes("student");

  return (
    <div className="min-h-screen bg-[#FAFBFD] relative">

      {/* Tutorial */}
      {showTutorial && !loading && (
        <TutorialOverlay
          steps={studentTutorialSteps}
          storageKey={`tutorial_student_${user.id}`}
        />
      )}

      {/* Header */}
      <header data-tutorial="student-welcome" className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden">
                <img src="/logo.svg" alt="numénor.ai" width="28" height="28" style={{objectFit:"contain"}} />
              </div>
              <span className="text-base font-bold gradient-text hidden sm:block">numénor.ai</span>
            </Link>
            <div className="w-px h-5 bg-[#00274C]/6 hidden sm:block" />
            <span className="tag tag-indigo hidden sm:flex">Student</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#00274C]/4 border border-[#00274C]/6">
              <span className="text-xs text-[#00274C]/50">{user.display_name}</span>
            </div>
            <Link href="/student/classroom" data-tutorial="student-classroom-link" className="btn-primary text-xs px-4 py-2">Classroom</Link>
            <Link href="/student/resume" data-tutorial="student-resume-link" className="btn-ghost text-xs px-4 py-2 hidden sm:flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              Resume
            </Link>
            <button onClick={logout} className="text-[#00274C]/30 hover:text-[#00274C]/60 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative z-10">
        {/* Join class */}
        {classList.length === 0 && (
          <div data-tutorial="student-join-class" className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#00274C]/5 to-transparent rounded-bl-full" />
            <h2 className="text-lg font-bold text-[#00274C] mb-2">Join a Class</h2>
            <p className="text-sm text-[#00274C]/50 mb-4">Enter the invite code your teacher gave you to get started.</p>
            <div className="flex gap-2 max-w-md">
              <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Enter invite code"
                className="input-dark flex-1 font-mono uppercase" onKeyDown={(e) => e.key === "Enter" && handleJoinClass()} />
              <button onClick={handleJoinClass} disabled={joining || !inviteCode.trim()} className="btn-primary px-6 disabled:opacity-30">
                {joining ? "..." : "Join"}
              </button>
            </div>
            {joinError && <p className="text-xs text-[#D50032] mt-2">{joinError}</p>}
          </div>
        )}

        {classList.length > 0 && (
          <div data-tutorial="student-join-class" className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-[#00274C]/30 uppercase tracking-wider font-semibold">Classes:</span>
            {classList.map((c) => (<span key={c.id} className="tag tag-indigo">{c.name}</span>))}
            <div className="flex gap-1.5 ml-auto">
              <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Invite code"
                className="input-dark w-36 h-9 text-xs font-mono uppercase px-3" onKeyDown={(e) => e.key === "Enter" && handleJoinClass()} />
              <button onClick={handleJoinClass} disabled={joining || !inviteCode.trim()} className="btn-ghost h-9 text-xs px-4 flex items-center justify-center disabled:opacity-30 min-w-[60px]">
                {joining ? "..." : "Join"}
              </button>
            </div>
          </div>
        )}

        {/* Portfolio */}
        <section data-tutorial="student-portfolio">
          <h2 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-4">Portfolio</h2>
          <PortfolioSummary portfolio={portfolio} loading={loading} />
        </section>

        {/* Positions */}
        {portfolio && portfolio.positions.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-4">Positions</h2>
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl overflow-hidden shadow-sm">
              <table className="table-dark">
                <thead><tr><th>Forecast</th><th>Outcome</th><th>Status</th><th className="text-right">Shares</th><th className="text-right">Price</th><th className="text-right">Delta</th></tr></thead>
                <tbody>
                  {portfolio.positions.map((p) => (
                    <tr key={p.id}>
                      <td className="text-[#00274C]/70">{p.market_title}</td>
                      <td className="text-[#00274C]/60">{p.outcome_label}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          p.status === "won" ? "bg-emerald-100 text-emerald-700" :
                          p.status === "lost" ? "bg-red-100 text-[#D50032]" :
                          "bg-[#00274C]/5 text-[#00274C]/50"
                        }`}>
                          {p.status === "won" && "✓ "}
                          {p.status === "lost" && "✗ "}
                          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </span>
                      </td>
                      <td className="text-right tabular-nums text-[#00274C]/70">{p.shares.toFixed(1)}</td>
                      <td className="text-right tabular-nums text-[#00274C]/60">{(p.current_price * 100).toFixed(1)}%</td>
                      <td className={`text-right tabular-nums font-semibold ${p.pnl >= 0 ? "text-emerald-600" : "text-[#D50032]"}`}>
                        {p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Forecasts */}
        <section data-tutorial="student-markets">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider">Forecasts</h2>
            <div className="flex gap-1.5">
              {[{ value: "live", label: "Live" }, { value: "resolved", label: "Resolved" }, { value: "", label: "All" }].map((f) => (
                <button key={f.value} onClick={() => setFilter(f.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                    filter === f.value ? "bg-[#00274C]/8 border border-[#00274C]/12 text-[#00274C]/80" : "bg-[#00274C]/[0.02] border border-[#00274C]/6 text-[#00274C]/40 hover:text-[#00274C]/60"
                  }`}>{f.label}</button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (<div key={i} className="bg-white/80 border border-[#00274C]/6 rounded-2xl animate-pulse p-6 h-48" />))}
            </div>
          ) : marketList.length === 0 ? (
            <div className="text-center py-20"><p className="text-[#00274C]/25 text-sm">{classList.length === 0 ? "Join a class to see forecasts." : "No forecasts found."}</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {marketList.map((market) => (<MarketCard key={market.id} market={market} href={`/student/markets/${market.id}`} />))}
            </div>
          )}
        </section>

        {/* Recent Trades */}
        {portfolio && portfolio.recent_trades.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-4">Recent Trades</h2>
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl overflow-hidden shadow-sm">
              <table className="table-dark">
                <thead><tr><th>Date</th><th>Forecast</th><th className="text-right">Shares</th><th className="text-right">Cost</th></tr></thead>
                <tbody>
                  {portfolio.recent_trades.map((t) => (
                    <tr key={t.id}>
                      <td className="text-[#00274C]/50 tabular-nums">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="text-[#00274C]/60">{t.market_id.slice(0, 8)}...</td>
                      <td className="text-right tabular-nums text-[#00274C]/70">{t.shares > 0 ? `+${t.shares.toFixed(1)}` : t.shares.toFixed(1)}</td>
                      <td className={`text-right tabular-nums font-semibold ${t.cost > 0 ? "text-[#D50032]" : "text-emerald-600"}`}>
                        {t.cost > 0 ? "-" : "+"}{Math.abs(t.cost).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
