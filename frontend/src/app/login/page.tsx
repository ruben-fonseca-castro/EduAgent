"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth as authApi, studentProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const DEMO_ACCOUNTS = [
  { key: "student1", label: "Demo Student 1", emoji: "🎓", color: "#00274C" },
  { key: "student2", label: "Demo Student 2", emoji: "🎓", color: "#00274C" },
  { key: "student3", label: "Demo Student 3", emoji: "🎓", color: "#00274C" },
  { key: "teacher",  label: "Demo Teacher",   emoji: "📚", color: "#7c3aed" },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const { login, user, isLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  // Demo-specific state
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) {
      router.push(user.role === "teacher" ? "/teacher" : "/student");
    }
  }, [isLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "register") {
        await authApi.register({ email, password, role, display_name: displayName });
      }
      const tokenData = await authApi.login({ email, password });
      const userData = await authApi.me(tokenData.access_token);
      login(tokenData.access_token, userData);

      // For students: check if quiz is completed, redirect to onboarding if not
      if (userData.role === "student") {
        try {
          const quizCheck = await studentProfile.checkQuiz(tokenData.access_token);
          if (!quizCheck.quiz_completed) {
            router.push("/student/onboarding");
            return;
          }
        } catch {
          // Quiz check failed — proceed to dashboard
        }
      }

      router.push(userData.role === "teacher" ? "/teacher" : "/student");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  /** One-click demo login — creates account if needed, then logs in */
  const handleDemoLogin = async (accountKey: string) => {
    setDemoLoading(accountKey);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/demo/${accountKey}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Demo login failed");
      }
      const tokenData: { access_token: string } = await res.json();
      const userData = await authApi.me(tokenData.access_token);
      login(tokenData.access_token, userData);

      if (userData.role === "student") {
        try {
          const quizCheck = await studentProfile.checkQuiz(tokenData.access_token);
          if (!quizCheck.quiz_completed) {
            router.push("/student/onboarding");
            return;
          }
        } catch {
          // proceed to dashboard
        }
        router.push("/student");
      } else {
        router.push("/teacher");
      }
    } catch (e: any) {
      setError(e.message || "Demo login failed");
    } finally {
      setDemoLoading(null);
    }
  };

  /** Reset all demo student accounts to blank state */
  const handleResetDemo = async () => {
    setResetLoading(true);
    setResetMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/demo/reset/all`, { method: "POST" });
      if (!res.ok) throw new Error("Reset failed");
      setResetMsg("✓ All demo accounts reset — students must re-do onboarding.");
      setTimeout(() => setResetMsg(null), 5000);
    } catch {
      setResetMsg("✗ Reset failed — is the backend running?");
      setTimeout(() => setResetMsg(null), 4000);
    } finally {
      setResetLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00274C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#FAFBFD]">
      {/* Background effects - light version */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#00274C]/[0.02] via-transparent to-[#FFCB05]/[0.04]" />

      <div className="w-full max-w-md px-6 relative z-10">
        {/* Logo + Back */}
        <div className="text-center mb-10 animate-fade-in-down">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 group">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden">
              <img src="/logo.svg" alt="numénor.ai" width="36" height="36" style={{objectFit:"contain"}} />
            </div>
            <span className="text-2xl font-bold gradient-text">numénor.ai</span>
          </Link>
          <h1 className="text-2xl font-bold text-[#00274C] mb-1">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-[#00274C]/50">
            {mode === "login"
              ? "Sign in to continue your learning journey"
              : "Join the AI-powered education platform"}
          </p>
        </div>

        {/* ── Demo Access Panel ───────────────────────────── */}
        <div className="bg-gradient-to-br from-[#FFCB05]/10 to-[#00274C]/5 border border-[#FFCB05]/30 rounded-2xl p-5 mb-4 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">⚡</span>
            <span className="text-xs font-bold text-[#00274C] uppercase tracking-wider">Hackathon Demo — One-Click Access</span>
          </div>

          {/* 4 demo login buttons */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.key}
                onClick={() => handleDemoLogin(acct.key)}
                disabled={demoLoading !== null}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all
                  bg-white/80 border-[#00274C]/10 hover:border-[#00274C]/25 hover:bg-white hover:shadow-sm
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {demoLoading === acct.key ? (
                  <div className="w-4 h-4 border-2 border-[#00274C]/30 border-t-[#00274C] rounded-full animate-spin flex-shrink-0" />
                ) : (
                  <span className="text-base flex-shrink-0">{acct.emoji}</span>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#00274C] truncate">{acct.label}</p>
                  <p className="text-[10px] text-[#00274C]/40 truncate">
                    {acct.key === "teacher" ? "Teacher view" : "Student view"}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Error from demo login */}
          {error && demoLoading === null && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-[#D50032]/10 border border-[#D50032]/20 mb-2">
              <span className="text-xs text-[#D50032]">{error}</span>
            </div>
          )}

          {/* Reset section */}
          <div className="border-t border-[#00274C]/8 pt-3 mt-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] text-[#00274C]/35 leading-tight">
                Resets demo students to blank state (quiz, lessons, sessions cleared).
              </p>
              <button
                onClick={handleResetDemo}
                disabled={resetLoading}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold
                  border border-[#D50032]/20 text-[#D50032]/70 bg-[#D50032]/5
                  hover:bg-[#D50032]/10 hover:border-[#D50032]/30 hover:text-[#D50032]
                  transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetLoading ? (
                  <div className="w-3 h-3 border border-[#D50032]/30 border-t-[#D50032] rounded-full animate-spin" />
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                  </svg>
                )}
                Reset Accounts
              </button>
            </div>
            {resetMsg && (
              <p className={`text-[10px] mt-1.5 font-medium ${resetMsg.startsWith("✓") ? "text-emerald-600" : "text-[#D50032]"}`}>
                {resetMsg}
              </p>
            )}
          </div>
        </div>

        {/* ── Normal login / register card ────────────────── */}
        <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl shadow-lg shadow-[#00274C]/5 p-8 animate-fade-in-up delay-100">
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === "register" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-[#00274C]/50 uppercase tracking-wider mb-2 block">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onFocus={() => setFocused("name")}
                    onBlur={() => setFocused(null)}
                    placeholder="Your name"
                    required
                    className="input-dark w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#00274C]/50 uppercase tracking-wider mb-2 block">I am a</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole("student")}
                      className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                        role === "student"
                          ? "bg-[#00274C]/8 border-[#00274C]/12 text-[#00274C]"
                          : "bg-[#00274C]/[0.02] border-[#00274C]/6 text-[#00274C]/50 hover:bg-[#00274C]/4 hover:border-[#00274C]/10"
                      }`}
                    >
                      <span className="text-lg block mb-1">🎓</span>
                      Student
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("teacher")}
                      className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                        role === "teacher"
                          ? "bg-[#FFCB05]/15 border-[#FFCB05]/30 text-amber-700"
                          : "bg-[#00274C]/[0.02] border-[#00274C]/6 text-[#00274C]/50 hover:bg-[#00274C]/4 hover:border-[#00274C]/10"
                      }`}
                    >
                      <span className="text-lg block mb-1">📚</span>
                      Teacher
                    </button>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-semibold text-[#00274C]/50 uppercase tracking-wider mb-2 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                placeholder="you@university.edu"
                required
                className="input-dark w-full"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#00274C]/50 uppercase tracking-wider mb-2 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                placeholder="••••••••"
                required
                className="input-dark w-full"
              />
            </div>

            {error && !demoLoading && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[#D50032]/10 border border-[#D50032]/20">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D50032" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span className="text-sm text-[#D50032]">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Please wait...
                </span>
              ) : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#00274C]/6 text-center">
            <button
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
              className="text-sm text-[#00274C]/50 hover:text-[#00274C] transition-colors"
            >
              {mode === "login" ? "Don't have an account? " : "Already have an account? "}
              <span className="font-semibold text-[#00274C] hover:text-[#00274C]/80">
                {mode === "login" ? "Register" : "Sign In"}
              </span>
            </button>
          </div>
        </div>

        {/* Back to home */}
        <div className="text-center mt-6 animate-fade-in-up delay-300">
          <Link href="/" className="text-xs text-[#00274C]/25 hover:text-[#00274C]/50 transition-colors">
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
