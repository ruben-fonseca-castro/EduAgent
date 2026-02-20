"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

interface SpeechBubbleProps {
  message: string;
  agentName: string;
  persona: string;
  visible?: boolean;
  enableTTS?: boolean;
}

const BUBBLE_COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  socratic_examiner: {
    bg: "bg-white",
    border: "border-[#00274C]/12",
    accent: "text-[#00274C] font-bold",
  },
  friendly_tutor: {
    bg: "bg-amber-50",
    border: "border-[#FFCB05]/30",
    accent: "text-amber-700 font-bold",
  },
  skeptic: {
    bg: "bg-red-50",
    border: "border-[#D50032]/15",
    accent: "text-[#D50032] font-bold",
  },
  practical_coach: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    accent: "text-emerald-700 font-bold",
  },
  teacher_proxy: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    accent: "text-violet-700 font-bold",
  },
};

export function SpeechBubble({ message, agentName, persona, visible = true, enableTTS = true }: SpeechBubbleProps) {
  const [speaking, setSpeaking] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const colors = BUBBLE_COLORS[persona] || BUBBLE_COLORS.socratic_examiner;
  const prevMessageRef = useRef("");

  // Flash animation when new message arrives
  useEffect(() => {
    if (!message || message === prevMessageRef.current) return;
    prevMessageRef.current = message;
    setIsNew(true);
    const t = setTimeout(() => setIsNew(false), 600);
    return () => clearTimeout(t);
  }, [message]);

  if (!visible || !message) return null;

  const handleSpeak = () => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1.05;
    utterance.pitch = persona === "skeptic" ? 0.95 : persona === "friendly_tutor" ? 1.1 : 1.0;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className={`
      ${colors.bg} border ${colors.border}
      rounded-2xl shadow-sm
      px-4 py-3 max-w-[280px] min-w-[160px]
      transition-all duration-300
      ${isNew ? "scale-[1.02] shadow-md" : "scale-100"}
    `}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-[10px] uppercase tracking-wider ${colors.accent}`}>
          {agentName}
        </span>
        {enableTTS && (
          <button
            onClick={handleSpeak}
            className="text-[#00274C]/25 hover:text-[#00274C]/60 transition-colors flex-shrink-0"
          >
            {speaking ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            )}
          </button>
        )}
      </div>
      {/* Markdown rendered content */}
      <div className="text-[#00274C]/80 text-sm leading-relaxed prose-bubble">
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-[#00274C]">{children}</strong>,
            em: ({ children }) => <em className="italic text-[#00274C]/70">{children}</em>,
            code: ({ children }) => (
              <code className="bg-[#00274C]/8 text-[#00274C] px-1.5 py-0.5 rounded text-[11px] font-mono">{children}</code>
            ),
            pre: ({ children }) => (
              <pre className="bg-[#00274C]/6 rounded-lg p-2 mt-1 mb-1 overflow-x-auto text-[11px] font-mono whitespace-pre-wrap">{children}</pre>
            ),
            ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1 pl-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1 pl-1">{children}</ol>,
            li: ({ children }) => <li className="text-[#00274C]/75 text-sm">{children}</li>,
            h1: ({ children }) => <h1 className="font-bold text-[#00274C] text-sm mt-1 mb-0.5">{children}</h1>,
            h2: ({ children }) => <h2 className="font-bold text-[#00274C] text-xs mt-1 mb-0.5">{children}</h2>,
            h3: ({ children }) => <h3 className="font-semibold text-[#00274C] text-xs mt-1 mb-0.5">{children}</h3>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-[#FFCB05] pl-2 italic text-[#00274C]/60 my-1">{children}</blockquote>
            ),
          }}
        >
          {message}
        </ReactMarkdown>
      </div>
    </div>
  );
}
