"use client";

const PERSONA_CONFIG: Record<string, { name: string; role: string; emoji: string; gradient: string; border: string; glow: string }> = {
  socratic_examiner: {
    name: "Socratic Examiner",
    role: "Probing Questions",
    emoji: "🏛️",
    gradient: "from-[#00274C] to-[#1B365D]",
    border: "border-[#00274C]/20",
    glow: "shadow-[#00274C]/15",
  },
  friendly_tutor: {
    name: "Friendly Tutor",
    role: "Gentle Explanations",
    emoji: "📚",
    gradient: "from-[#FFCB05] to-[#E6B800]",
    border: "border-[#FFCB05]/20",
    glow: "shadow-[#FFCB05]/15",
  },
  skeptic: {
    name: "Skeptic",
    role: "Counterexamples",
    emoji: "🔍",
    gradient: "from-[#D50032] to-red-600",
    border: "border-[#D50032]/20",
    glow: "shadow-[#D50032]/15",
  },
  practical_coach: {
    name: "Practical Coach",
    role: "Action Steps",
    emoji: "🎯",
    gradient: "from-emerald-500 to-emerald-600",
    border: "border-emerald-400/20",
    glow: "shadow-emerald-500/15",
  },
  teacher_proxy: {
    name: "Teacher Proxy",
    role: "Rubric Alignment",
    emoji: "👩‍🏫",
    gradient: "from-violet-500 to-violet-600",
    border: "border-violet-400/20",
    glow: "shadow-violet-500/15",
  },
};

interface AIAvatarProps {
  persona: string;
  animation?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showLabel?: boolean;
  showRole?: boolean;
}

export function AIAvatar({ persona, animation = "idle", size = "md", showLabel = false, showRole = false }: AIAvatarProps) {
  const config = PERSONA_CONFIG[persona] || PERSONA_CONFIG.socratic_examiner;

  const sizeClasses = {
    sm: "w-10 h-10 rounded-xl text-base",
    md: "w-14 h-14 rounded-2xl text-xl",
    lg: "w-20 h-20 rounded-3xl text-3xl",
    xl: "w-28 h-28 rounded-3xl text-4xl",
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`
        relative bg-gradient-to-br ${config.gradient}
        ${sizeClasses[size]}
        flex items-center justify-center
        border ${config.border}
        shadow-lg ${config.glow}
        avatar-${animation}
        transition-all duration-300
      `}>
        <span className="relative z-10">{config.emoji}</span>
        <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
        {animation !== "idle" && animation !== "" && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a1628]" />
        )}
      </div>
      {showLabel && (
        <div className="text-center">
          <p className="text-xs font-semibold text-white/70">{config.name}</p>
          {showRole && <p className="text-[10px] text-white/25">{config.role}</p>}
        </div>
      )}
    </div>
  );
}
