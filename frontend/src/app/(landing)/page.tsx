"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

// ═══════════════════════════════════════════════════════
// ANIMATED COUNTER HOOK
// ═══════════════════════════════════════════════════════
function useCounter(end: number, duration = 2000, start = 0) {
  const [value, setValue] = useState(start);
  const ref = useRef<HTMLDivElement>(null);
  const triggered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || triggered.current) return;

    const runCounter = () => {
      if (triggered.current) return;
      triggered.current = true;
      let startTime: number;
      let raf: number;
      const step = (ts: number) => {
        if (!startTime) startTime = ts;
        const progress = Math.min((ts - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(start + (end - start) * eased));
        if (progress < 1) { raf = requestAnimationFrame(step); }
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    };

    // Check if already in viewport
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      runCounter();
      return;
    }

    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { runCounter(); obs.disconnect(); } },
      { threshold: 0.01 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [end, duration, start]);

  return { value, ref };
}

// ═══════════════════════════════════════════════════════
// INTERSECTION OBSERVER HOOK
// ═══════════════════════════════════════════════════════
function useInView() {
  const ref = useRef<HTMLDivElement>(null);
  // Default true — sections visible unless proven otherwise
  const [isInView, setIsInView] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Already in viewport? Stay visible.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setIsInView(true);
      return;
    }

    // Below fold — hide it and use observer to reveal on scroll
    setIsInView(false);
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setIsInView(true); obs.disconnect(); } },
      { threshold: 0.05, rootMargin: "0px 0px -30px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, isInView };
}

// ═══════════════════════════════════════════════════════
// MINI ANIMATED COMPONENTS
// ═══════════════════════════════════════════════════════

function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="orb-blue w-[500px] h-[500px] absolute top-[-10%] left-[10%] rounded-full blur-[80px] opacity-40" style={{ background: "radial-gradient(circle, rgba(0,39,76,0.08), transparent 70%)" }} />
      <div className="orb-maize w-[400px] h-[400px] absolute top-[40%] right-[-5%] rounded-full blur-[80px] opacity-50" style={{ background: "radial-gradient(circle, rgba(255,203,5,0.12), transparent 70%)" }} />
      <div className="orb-red w-[350px] h-[350px] absolute bottom-[-5%] left-[30%] rounded-full blur-[80px] opacity-30" style={{ background: "radial-gradient(circle, rgba(213,0,50,0.05), transparent 70%)" }} />
    </div>
  );
}

function HeroMockupClassroom() {
  const [active, setActive] = useState(0);
  const agents = [
    { name: "Socratic", color: "from-[#00274C] to-[#1B365D]", msg: "Why do you think that's the case?", emoji: "🏛️" },
    { name: "Tutor", color: "from-[#FFCB05] to-[#E6B800]", msg: "Great start! Think of it this way...", emoji: "📚" },
    { name: "Skeptic", color: "from-[#D50032] to-red-600", msg: "But what about edge cases?", emoji: "🔍" },
  ];

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % 3), 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <div className="glass-card p-6 space-y-4">
        <div className="bg-[#00274C]/[0.03] border border-[#00274C]/8 rounded-xl px-5 py-4 text-center">
          <div className="text-[10px] text-[#00274C]/40 uppercase tracking-widest mb-1 font-semibold">Live Whiteboard</div>
          <p className="text-[#00274C]/60 text-sm">Photosynthesis converts light energy into chemical energy...</p>
        </div>

        <div className="flex items-center justify-center gap-4">
          {agents.map((a, i) => (
            <div key={a.name} className={`transition-all duration-500 ${active === i ? "scale-110 opacity-100" : "scale-95 opacity-40"}`}>
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${a.color} flex items-center justify-center text-xl shadow-md ${active === i ? "avatar-idle" : ""}`}>
                {a.emoji}
              </div>
              <p className="text-[10px] text-center mt-1 text-[#00274C]/50">{a.name}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#00274C]/[0.02] border border-[#00274C]/5 rounded-xl p-3 text-center transition-all duration-500" key={active}>
          <p className="text-xs text-[#00274C]/60 animate-fade-in-up">&ldquo;{agents[active].msg}&rdquo;</p>
          <p className="text-[10px] text-[#00274C] font-semibold mt-1">— {agents[active].name}</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#00274C]/30 uppercase tracking-widest">Teaching Score</span>
          <div className="flex-1 progress-glow">
            <div className="fill" style={{ width: "72%" }} />
          </div>
          <span className="text-xs font-bold text-emerald-600">72</span>
        </div>
      </div>
    </div>
  );
}

function HeroMockupMarket() {
  const [yesPrice, setYesPrice] = useState(65);

  useEffect(() => {
    const t = setInterval(() => {
      setYesPrice((p) => Math.max(20, Math.min(85, p + (Math.random() - 0.48) * 5)));
    }, 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="tag tag-emerald">LIVE</span>
          <span className="text-[10px] text-[#00274C]/30">CS 301 — Fall 2026</span>
        </div>
        <h3 className="text-sm font-semibold text-[#00274C]">Will the class average exceed 85% on the midterm?</h3>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#00274C]/50 w-8">Yes</span>
            <div className="flex-1 h-6 rounded-lg bg-emerald-50 overflow-hidden relative">
              <div className="h-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700 flex items-center px-2"
                   style={{ width: `${yesPrice}%` }}>
                <span className="text-[10px] font-bold text-white">{Math.round(yesPrice)}%</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#00274C]/50 w-8">No</span>
            <div className="flex-1 h-6 rounded-lg bg-red-50 overflow-hidden relative">
              <div className="h-full rounded-lg bg-gradient-to-r from-[#D50032] to-red-400 transition-all duration-700 flex items-center px-2"
                   style={{ width: `${100 - yesPrice}%` }}>
                <span className="text-[10px] font-bold text-white">{Math.round(100 - yesPrice)}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 py-2 text-center rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold cursor-pointer hover:bg-emerald-100 transition-colors">Buy Yes</div>
          <div className="flex-1 py-2 text-center rounded-lg bg-red-50 border border-red-200 text-[#D50032] text-xs font-semibold cursor-pointer hover:bg-red-100 transition-colors">Buy No</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN LANDING PAGE CONTENT (separate component so hooks
// only run when the content is actually mounted)
// ═══════════════════════════════════════════════════════

function LandingContent() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const stats1 = useCounter(5, 1500);
  const stats2 = useCounter(94, 2000);
  const stats3 = useCounter(12000, 2500);
  const stats4 = useCounter(200, 1800);

  const section1 = useInView();
  const section2 = useInView();
  const section3 = useInView();
  const section4 = useInView();

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#FAFBFD]">
      <FloatingOrbs />

      {/* ─── NAV ─── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrollY > 50 ? "bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6 shadow-sm" : ""}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-md overflow-hidden">
              <img src="/logo.svg" alt="numénor.ai" width="28" height="28" style={{objectFit:"contain"}} />
            </div>
            <span className="text-lg font-bold tracking-tight text-[#00274C]">numénor.ai</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-ghost text-sm px-5 py-2">Sign In</Link>
            <Link href="/login" className="btn-maize text-sm px-5 py-2 rounded-xl">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════
         HERO SECTION
         ═══════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 pb-20">
        <div className="absolute top-[30%] left-0 right-0 h-px aurora-line" />
        <div className="absolute top-[60%] left-0 right-0 h-px aurora-line" style={{ animationDelay: "-3s", animationDuration: "10s" }} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FFCB05]/10 border border-[#FFCB05]/25 mb-8 animate-fade-in-down">
            <span className="w-2 h-2 rounded-full bg-[#00274C] animate-pulse" />
            <span className="text-xs text-[#00274C]/70 font-medium">AI-Powered Education Platform</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-6 animate-fade-in-up">
            <span className="text-[#00274C]">Learn by</span>
            <br />
            <span className="gradient-text-warm">Teaching AI</span>
          </h1>

          <p className="text-base sm:text-lg text-[#00274C]/50 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up delay-200">
            An immersive classroom where AI students learn from you — plus prediction forecasts
            that make classes more fun. The future of education is here: teaching is the best way to learn.
          </p>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-4 animate-fade-in-up delay-300">
            <Link href="/login" className="btn-maize text-base px-8 py-3.5 rounded-xl shadow-lg">
              Start Teaching
              <svg className="inline-block ml-2 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <a href="#features" className="btn-ghost text-base px-8 py-3.5">
              See How It Works
            </a>
          </div>

          {/* Hero mockups */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto animate-fade-in-up delay-500">
            <div className="animate-float-slow">
              <HeroMockupClassroom />
            </div>
            <div className="animate-float-medium" style={{ animationDelay: "-2s" }}>
              <HeroMockupMarket />
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-pulse-glow">
          <span className="text-[10px] text-[#00274C]/20 uppercase tracking-widest">Scroll</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00274C" strokeWidth="1.5" className="opacity-20">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
         STATS BAR
         ═══════════════════════════════════════════════════════ */}
      <section className="relative border-y border-[#00274C]/6 bg-gradient-to-r from-[#00274C] to-[#1B365D]">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { counter: stats1, suffix: "", label: "AI Classroom Agents", icon: "🏛️" },
              { counter: stats2, suffix: "%", label: "Knowledge Retention", icon: "🧠" },
              { counter: stats3, suffix: "+", label: "Predictions Traded", icon: "📊" },
              { counter: stats4, suffix: "+", label: "Active Students", icon: "🎓" },
            ].map(({ counter, suffix, label, icon }, i) => (
              <div key={i} ref={counter.ref} className="text-center counter-animate" style={{ animationDelay: `${i * 0.15}s` }}>
                <p className="text-3xl md:text-4xl font-bold text-[#FFCB05] mb-1">{counter.value}{suffix}</p>
                <p className="text-xs text-white/60">{icon} {label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
         FEATURE 1 — AI CLASSROOM
         ═══════════════════════════════════════════════════════ */}
      <section id="features" className="relative py-32" ref={section1.ref}>
        <div className="max-w-7xl mx-auto px-6">
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-16 items-center transition-all duration-1000 ${section1.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            <div>
              <span className="tag tag-indigo mb-4 inline-flex">AI Classroom</span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-6">
                <span className="text-[#00274C]">Teach AI students.</span><br />
                <span className="text-[#00274C]/40">Master any subject.</span>
              </h2>
              <p className="text-[#00274C]/50 text-base leading-relaxed mb-8 max-w-lg">
                Upload your course materials. Our RAG-powered AI creates virtual students
                who ask real questions, get confused, and challenge your explanations —
                forcing you to truly understand the material.
              </p>
              <div className="space-y-4">
                {[
                  { icon: "📄", title: "RAG-Powered Context", desc: "Upload PDFs, docs, images — AI learns from your materials" },
                  { icon: "🏛️", title: "5 Unique AI Personas", desc: "Socratic, Tutor, Skeptic, Coach, and Teacher Proxy agents" },
                  { icon: "📈", title: "Teaching Analytics", desc: "Real-time scoring, style profile, and improvement tracking" },
                ].map((f, i) => (
                  <div key={i} className="flex gap-4 items-start group">
                    <div className="w-10 h-10 rounded-xl bg-[#00274C]/[0.04] border border-[#00274C]/8 flex items-center justify-center text-lg flex-shrink-0 group-hover:bg-[#FFCB05]/10 group-hover:border-[#FFCB05]/30 transition-all">
                      {f.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#00274C]">{f.title}</p>
                      <p className="text-xs text-[#00274C]/40 mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <HeroMockupClassroom />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
         FEATURE 2 — PREDICTION FORECASTS
         ═══════════════════════════════════════════════════════ */}
      <section className="relative py-32 bg-[#00274C]/[0.02]" ref={section2.ref}>
        <div className="max-w-7xl mx-auto px-6">
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-16 items-center transition-all duration-1000 ${section2.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            <div className="order-2 lg:order-1 relative">
              <HeroMockupMarket />
            </div>
            <div className="order-1 lg:order-2">
              <span className="tag tag-emerald mb-4 inline-flex">Prediction Forecasts</span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-6">
                <span className="text-[#00274C]">Trade on knowledge.</span><br />
                <span className="text-[#00274C]/40">Bet on outcomes.</span>
              </h2>
              <p className="text-[#00274C]/50 text-base leading-relaxed mb-8 max-w-lg">
                Teachers create forecasts around class concepts and deadlines. Students trade
                with virtual coins, making predictions that reveal true understanding —
                and expose knowledge gaps.
              </p>
              <div className="space-y-4">
                {[
                  { icon: "🎯", title: "Concept Forecasts", desc: "Will the class master recursion by Friday?" },
                  { icon: "💰", title: "Virtual Economy", desc: "Blue Coins reward genuine knowledge, not guessing" },
                  { icon: "🔍", title: "AI Analysis", desc: "Sentiment analysis and explainable AI for every trade" },
                ].map((f, i) => (
                  <div key={i} className="flex gap-4 items-start group">
                    <div className="w-10 h-10 rounded-xl bg-[#00274C]/[0.04] border border-[#00274C]/8 flex items-center justify-center text-lg flex-shrink-0 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/20 transition-all">
                      {f.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#00274C]">{f.title}</p>
                      <p className="text-xs text-[#00274C]/40 mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
         HOW IT WORKS
         ═══════════════════════════════════════════════════════ */}
      <section className="relative py-32" ref={section3.ref}>
        <div className="max-w-7xl mx-auto px-6">
          <div className={`text-center mb-16 transition-all duration-1000 ${section3.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            <span className="tag tag-maize mb-4 inline-flex mx-auto">How It Works</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              <span className="text-[#00274C]">Three steps to</span>{" "}
              <span className="gradient-text-warm">mastery</span>
            </h2>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 transition-all duration-1000 delay-200 ${section3.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            {[
              {
                step: "01",
                title: "Upload Materials",
                desc: "Teachers upload PDFs, docs, and media. Our RAG pipeline chunks, embeds, and indexes everything automatically.",
                color: "text-[#00274C]",
                bgColor: "bg-[#00274C]/[0.04]",
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#00274C]">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                ),
              },
              {
                step: "02",
                title: "Teach AI Students",
                desc: "Enter the immersive classroom. Explain concepts to AI personas who adapt to your teaching style in real-time.",
                color: "text-[#FFCB05]",
                bgColor: "bg-[#FFCB05]/10",
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#E6B800]">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
              },
              {
                step: "03",
                title: "Trade & Grow",
                desc: "Predict outcomes in class forecasts. Your trading performance and teaching scores build your learning portfolio.",
                color: "text-[#D50032]",
                bgColor: "bg-[#D50032]/[0.04]",
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#D50032]">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                ),
              },
            ].map((item, i) => (
              <div key={i} className="glass-card p-8 relative group" style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="absolute top-4 right-4 text-6xl font-black text-[#00274C]/[0.04] leading-none">{item.step}</div>
                <div className={`w-12 h-12 rounded-2xl ${item.bgColor} flex items-center justify-center mb-5`}>
                  {item.icon}
                </div>
                <h3 className="text-lg font-bold text-[#00274C] mb-2">{item.title}</h3>
                <p className="text-sm text-[#00274C]/45 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
         FOR TEACHERS & STUDENTS
         ═══════════════════════════════════════════════════════ */}
      <section className="relative py-32 bg-[#00274C]/[0.02]" ref={section4.ref}>
        <div className="max-w-7xl mx-auto px-6">
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 transition-all duration-1000 ${section4.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            {/* Teachers */}
            <div className="glass-card p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#FFCB05]/10 to-transparent rounded-bl-full" />
              <span className="tag tag-maize mb-4 inline-flex">For Teachers</span>
              <h3 className="text-2xl font-bold text-[#00274C] mb-4">Complete classroom control</h3>
              <ul className="space-y-3 text-sm text-[#00274C]/50">
                {[
                  "Create courses with RAG-powered content",
                  "Design prediction forecasts for your class",
                  "View per-student analytics and teaching scores",
                  "AI-powered insights on class performance",
                  "Track engagement and knowledge gaps",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-[#FFCB05] mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Students */}
            <div className="glass-card p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#00274C]/5 to-transparent rounded-bl-full" />
              <span className="tag tag-indigo mb-4 inline-flex">For Students</span>
              <h3 className="text-2xl font-bold text-[#00274C] mb-4">Learn by doing, not memorizing</h3>
              <ul className="space-y-3 text-sm text-[#00274C]/50">
                {[
                  "Teach AI agents to deepen understanding",
                  "Trade on prediction forecasts with Blue Coins",
                  "Get real-time feedback on teaching quality",
                  "Track your progress with detailed analytics",
                  "Voice-powered natural interaction",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-[#00274C] mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
         CTA
         ═══════════════════════════════════════════════════════ */}
      <section className="relative py-32 bg-gradient-to-br from-[#00274C] to-[#1B365D] overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-[20%] left-[10%] w-64 h-64 rounded-full bg-[#FFCB05]/20 blur-[80px]" />
          <div className="absolute bottom-[20%] right-[10%] w-48 h-48 rounded-full bg-[#D50032]/15 blur-[60px]" />
        </div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
            <span className="text-white">Ready to transform</span><br />
            <span className="text-[#FFCB05]">how you learn?</span>
          </h2>
          <p className="text-white/50 text-base mb-10 max-w-lg mx-auto">
            Join the platform where teaching AI makes you smarter, and prediction forecasts make knowledge real.
          </p>
          <Link href="/login" className="btn-maize text-lg px-10 py-4 rounded-xl shadow-xl inline-block">
            Get Started Free
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-[#00274C]/6 py-8 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shadow-sm overflow-hidden">
              <img src="/logo.svg" alt="numénor.ai" width="22" height="22" style={{objectFit:"contain"}} />
            </div>
            <span className="text-sm font-semibold text-[#00274C]/60">numénor.ai</span>
          </div>
          <div className="maize-stripe w-24" />
          <p className="text-xs text-[#00274C]/30">Built for the future of education</p>
        </div>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ROOT EXPORT — handles auth gating, renders LandingContent
// only when we know the user is not logged in
// ═══════════════════════════════════════════════════════

export default function LandingPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.push(user.role === "teacher" ? "/teacher" : "/student");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFBFD]">
        <div className="w-8 h-8 border-2 border-[#00274C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) return null;

  // Only mount LandingContent (with its hooks + refs) once we know
  // the user is unauthenticated — so refs are always attached properly
  return <LandingContent />;
}
