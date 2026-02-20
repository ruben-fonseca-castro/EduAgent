"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const PERSONA_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  socratic_examiner: { bg: "bg-[#00274C]/5", border: "border-[#00274C]/10", icon: "🏛️" },
  friendly_tutor: { bg: "bg-[#FFCB05]/10", border: "border-[#FFCB05]/20", icon: "🌟" },
  skeptic: { bg: "bg-[#D50032]/5", border: "border-[#D50032]/10", icon: "🔍" },
  practical_coach: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "🎯" },
  teacher_proxy: { bg: "bg-violet-50", border: "border-violet-200", icon: "👨‍🏫" },
  system: { bg: "bg-gray-50", border: "border-gray-200", icon: "⚙️" },
};

interface AgentMessageProps {
  agentName: string;
  persona: string;
  message: string;
  enableTTS?: boolean;
}

export function AgentMessage({ agentName, persona, message, enableTTS = true }: AgentMessageProps) {
  const [speaking, setSpeaking] = useState(false);
  const style = PERSONA_STYLES[persona] || PERSONA_STYLES.system;

  const handleSpeak = () => {
    if (!("speechSynthesis" in window)) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className={`rounded-lg border p-3 ${style.bg} ${style.border}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold">
          {style.icon} {agentName}
        </span>
        {enableTTS && "speechSynthesis" in (typeof window !== "undefined" ? window : {}) && (
          <Button variant="ghost" size="sm" onClick={handleSpeak} className="h-6 px-2 text-xs">
            {speaking ? "⏹ Stop" : "🔊 Listen"}
          </Button>
        )}
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{message}</p>
    </div>
  );
}
