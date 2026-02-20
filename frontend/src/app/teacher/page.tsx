"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MarketCard } from "@/components/MarketCard";
import {
  markets as marketsApi,
  classes as classesApi,
  analytics as analyticsApi,
  type MarketResponse,
  type ClassResponse,
  type FlagsResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { teacherTutorialSteps } from "@/lib/tutorialSteps";

const TutorialOverlay = dynamic(() => import("@/components/TutorialOverlay"), { ssr: false });

export default function TeacherDashboard() {
  const router = useRouter();
  const { token, user, logout, isLoading: authLoading } = useAuth();
  const [marketList, setMarketList] = useState<MarketResponse[]>([]);
  const [classList, setClassList] = useState<ClassResponse[]>([]);
  const [flags, setFlags] = useState<FlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [newClassName, setNewClassName] = useState("");
  const [creatingClass, setCreatingClass] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token || !user) { router.push("/login"); return; }
    if (user.role !== "teacher") { router.push("/student"); return; }
    loadData();
  }, [authLoading, token, user, filter]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [mktData, classData] = await Promise.all([
        marketsApi.list(token, { status: filter || undefined }),
        classesApi.list(token),
      ]);
      setMarketList(mktData.markets);
      setClassList(classData.classes);
      if (classData.classes.length > 0) {
        try {
          const flagData = await analyticsApi.flags(token, classData.classes[0].id);
          setFlags(flagData);
        } catch {}
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async () => {
    if (!token || !newClassName.trim()) return;
    setCreatingClass(true);
    try {
      await classesApi.create(token, { name: newClassName.trim() });
      setNewClassName("");
      loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingClass(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!user) return null;

  const liveCount = marketList.filter(m => m.status === "live").length;
  const pendingCount = marketList.filter(m => m.status === "draft" || m.status === "pending").length;
  const resolvedCount = marketList.filter(m => m.status === "resolved" || m.status === "settled").length;

  // Show tutorial for demo teacher accounts (demo.teacher@astra.edu)
  const showTutorial = user?.email?.includes("demo") && user?.email?.includes("teacher");

  return (
    <div className="min-h-screen bg-[#FAFBFD] relative">

      {/* Tutorial */}
      {showTutorial && !loading && (
        <TutorialOverlay
          steps={teacherTutorialSteps}
          storageKey={`tutorial_teacher_${user.id}`}
        />
      )}

      {/* Header */}
      <header data-tutorial="teacher-welcome" className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden">
                <img src="/logo.svg" alt="numénor.ai" width="28" height="28" style={{objectFit:"contain"}} />
              </div>
              <span className="text-base font-bold gradient-text hidden sm:block">numénor.ai</span>
            </Link>
            <div className="w-px h-5 bg-[#00274C]/6 hidden sm:block" />
            <span className="tag tag-amber hidden sm:flex">Teacher</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#00274C]/40 hidden md:block">{user.display_name}</span>
            <Link href="/teacher/courses" data-tutorial="teacher-courses-link" className="btn-ghost text-xs px-4 py-2">Courses</Link>
            {classList.length > 0 && (
              <Link href="/teacher/create" data-tutorial="teacher-create-market" className="btn-primary text-xs px-4 py-2">+ Create Forecast</Link>
            )}
            <button onClick={logout} className="text-[#00274C]/30 hover:text-[#00274C]/60 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative z-10">
        {/* Classes */}
        <section>
          <h2 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-4">Your Classes</h2>
          {classList.length === 0 ? (
            <div data-tutorial="teacher-create-class" className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#FFCB05]/10 to-transparent rounded-bl-full" />
              <p className="text-[#00274C]/50 text-sm mb-4">Create a class to get started. Students join with your invite code.</p>
              <div className="flex gap-2 max-w-md">
                <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="e.g. CS 101 - Spring 2026"
                  className="input-dark flex-1" onKeyDown={(e) => e.key === "Enter" && handleCreateClass()} />
                <button onClick={handleCreateClass} disabled={creatingClass || !newClassName.trim()} className="btn-primary px-6 disabled:opacity-30">
                  {creatingClass ? "..." : "Create"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {classList.map((cls, i) => (
                <div key={cls.id} data-tutorial={i === 0 ? "teacher-invite-code" : undefined} className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-4 flex items-center justify-between group shadow-sm">
                  <div>
                    <h3 className="text-sm font-semibold text-[#00274C]">{cls.name}</h3>
                    <p className="text-[10px] text-[#00274C]/25 font-mono">{cls.id}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] text-[#00274C]/30 uppercase tracking-wider">Invite Code</p>
                      <p className="font-mono text-lg font-bold text-[#00274C]">{cls.invite_code}</p>
                    </div>
                    <button onClick={() => copyCode(cls.invite_code)}
                      className={`btn-ghost text-xs px-3 py-1.5 ${copied === cls.invite_code ? "text-emerald-600 border-emerald-500/30" : ""}`}>
                      {copied === cls.invite_code ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              ))}
              <div data-tutorial="teacher-create-class" className="flex gap-2">
                <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="Create another class..."
                  className="input-dark flex-1" onKeyDown={(e) => e.key === "Enter" && handleCreateClass()} />
                <button onClick={handleCreateClass} disabled={creatingClass || !newClassName.trim()} className="btn-ghost text-xs px-4 disabled:opacity-30">+ Add</button>
              </div>
            </div>
          )}
        </section>

        {/* Stats */}
        <div data-tutorial="teacher-stats" className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { value: marketList.length, label: "Total Forecasts", color: "text-[#00274C]", icon: "📊" },
            { value: liveCount, label: "Live", color: "text-emerald-600", icon: "🟢" },
            { value: pendingCount, label: "Pending", color: "text-amber-600", icon: "⏳" },
            { value: resolvedCount, label: "Resolved", color: "text-[#00274C]", icon: "✅" },
          ].map((s, i) => (
            <div key={i} className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{s.icon}</span>
                <span className="text-[10px] text-[#00274C]/30 uppercase tracking-wider font-semibold">{s.label}</span>
              </div>
              <p className={`text-3xl font-bold ${s.color} tabular-nums`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Pending approval */}
        {pendingCount > 0 && (
          <section>
            <h2 className="text-sm font-bold text-amber-600/60 uppercase tracking-wider mb-4">Needs Approval</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {marketList.filter(m => m.status === "draft" || m.status === "pending").map((market) => (
                <MarketCard key={market.id} market={market} href={`/teacher/market/${market.id}`} />
              ))}
            </div>
          </section>
        )}

        {/* All Forecasts */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider">All Forecasts</h2>
            <div className="flex gap-1.5">
              {[{ value: "", label: "All" }, { value: "live", label: "Live" }, { value: "draft", label: "Draft" }, { value: "resolved", label: "Resolved" }].map((f) => (
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
            <div className="text-center py-20">
              <p className="text-[#00274C]/25 text-sm mb-4">{classList.length === 0 ? "Create a class first." : "No forecasts yet."}</p>
              {classList.length > 0 && (<Link href="/teacher/create" className="btn-primary text-sm">Create Your First Forecast</Link>)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {marketList.map((market) => (<MarketCard key={market.id} market={market} href={`/teacher/market/${market.id}`} />))}
            </div>
          )}
        </section>

        {/* Flags */}
        {flags && flags.flags.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-[#D50032]/60 uppercase tracking-wider mb-4">Trading Alerts</h2>
            <div className="space-y-2">
              {flags.flags.map((flag, i) => (
                <div key={i} className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-3 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-[#00274C]/70">{flag.display_name}</span>
                    <span className="text-xs text-[#00274C]/30">{flag.details}</span>
                  </div>
                  <span className={`tag ${flag.severity === "high" ? "tag-red" : flag.severity === "medium" ? "tag-amber" : "tag-white"}`}>
                    {flag.flag_type}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
