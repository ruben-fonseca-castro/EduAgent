"use client";

interface TeachingScoreProps {
  score: number;
  styleProfile?: Record<string, number> | null;
}

export function TeachingScore({ score, styleProfile }: TeachingScoreProps) {
  const percentage = Math.min(100, Math.max(0, score));

  const getColor = (val: number) => {
    if (val >= 70) return "text-emerald-600";
    if (val >= 40) return "text-amber-500";
    return "text-red-500";
  };

  const getBarColor = (val: number) => {
    if (val >= 70) return "bg-emerald-500";
    if (val >= 40) return "bg-amber-500";
    return "bg-red-500";
  };

  const styleLabels: Record<string, string> = {
    uses_analogies: "Analogies",
    uses_examples: "Examples",
    breaks_down_steps: "Step-by-step",
    checks_understanding: "Checking",
    accuracy: "Accuracy",
  };

  return (
    <div className="space-y-3">
      {/* Main score */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 bg-[#00274C]/8 rounded-full overflow-hidden">
            <div
              className={`h-full ${getBarColor(percentage)} rounded-full transition-all duration-700 ease-out`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
        <span className={`text-lg font-bold tabular-nums ${getColor(percentage)}`}>
          {Math.round(percentage)}
        </span>
      </div>

      {/* Style breakdown */}
      {styleProfile && Object.keys(styleProfile).length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {Object.entries(styleProfile).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <div className="flex-1">
                <div className="text-[10px] text-[#00274C]/50 mb-0.5 font-medium">
                  {styleLabels[key] || key}
                </div>
                <div className="h-1 bg-[#00274C]/8 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#FFCB05]/70 rounded-full transition-all duration-500"
                    style={{ width: `${(val as number) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
