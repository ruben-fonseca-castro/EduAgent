"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markets as marketsApi, classes as classesApi, type ClassResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const TEMPLATES = [
  {
    name: "Concept Mastery",
    type: "concept",
    title: "Will >70% of students master [topic] by the next quiz?",
    description: "Predict whether the class will demonstrate mastery of a specific concept.",
    outcomes: [
      { label: "Yes (>70% mastery)", display_order: 0 },
      { label: "No (<70% mastery)", display_order: 1 },
    ],
  },
  {
    name: "Project Deadline",
    type: "deadline",
    title: "Will [project] be submitted on time by >80% of teams?",
    description: "Forecast whether most teams will meet the project deadline.",
    outcomes: [
      { label: "On time (>80%)", display_order: 0 },
      { label: "Late (<80%)", display_order: 1 },
    ],
  },
  {
    name: "Study Adherence",
    type: "wellbeing",
    title: "Will average study hours stay above [X] this week?",
    description: "Opt-in well-being forecast tracking study engagement.",
    outcomes: [
      { label: "Yes (above target)", display_order: 0 },
      { label: "No (below target)", display_order: 1 },
    ],
  },
  {
    name: "Custom (3 outcomes)",
    type: "concept",
    title: "",
    description: "",
    outcomes: [
      { label: "Outcome A", display_order: 0 },
      { label: "Outcome B", display_order: 1 },
      { label: "Outcome C", display_order: 2 },
    ],
  },
];

export default function CreateMarketPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [marketType, setMarketType] = useState("concept");
  const [outcomes, setOutcomes] = useState<{ label: string; display_order: number }[]>([
    { label: "Yes", display_order: 0 },
    { label: "No", display_order: 1 },
  ]);
  const [bParam, setBParam] = useState(100);
  const [maxPosition, setMaxPosition] = useState(500);
  const [maxDailySpend, setMaxDailySpend] = useState(200);
  const [classList, setClassList] = useState<ClassResponse[]>([]);
  const [classId, setClassId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    if (token) {
      classesApi.list(token).then((data) => {
        setClassList(data.classes);
        if (data.classes.length > 0) {
          setClassId(data.classes[0].id);
        }
      });
    }
  }, [token]);

  const selectTemplate = (template: (typeof TEMPLATES)[0]) => {
    setTitle(template.title);
    setDescription(template.description);
    setMarketType(template.type);
    setOutcomes(template.outcomes);
    setStep(2);
  };

  const addOutcome = () => {
    setOutcomes([...outcomes, { label: "", display_order: outcomes.length }]);
  };

  const removeOutcome = (index: number) => {
    if (outcomes.length <= 2) return;
    setOutcomes(outcomes.filter((_, i) => i !== index));
  };

  const updateOutcome = (index: number, label: string) => {
    const updated = [...outcomes];
    updated[index] = { ...updated[index], label };
    setOutcomes(updated);
  };

  const handleCreate = async () => {
    if (!token || !classId) return;
    setLoading(true);
    setError(null);
    try {
      const market = await marketsApi.create(token, {
        class_id: classId,
        title,
        description,
        market_type: marketType,
        outcomes,
        b_param: bParam,
        max_position: maxPosition,
        max_daily_spend: maxDailySpend,
      });
      router.push(`/teacher/market/${market.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFBFD] relative">

      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/teacher" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="w-px h-5 bg-[#00274C]/6" />
          <h1 className="text-lg font-semibold text-[#00274C]">Create Forecast</h1>
          <div className="ml-auto flex gap-1">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-8 h-1 rounded-full ${step >= s ? "bg-[#00274C]" : "bg-[#00274C]/20"}`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 relative">
        {/* Step 1: Template Selection */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-[#00274C]">Choose a Template</h2>
              <p className="text-sm text-[#00274C]/50 mt-1">Templates are aligned to common learning objectives.</p>
            </div>

            {classList.length === 0 && (
              <div className="bg-[#FFCB05]/10 border border-[#FFCB05]/20 text-amber-700 text-sm p-3 rounded-md">
                You need to create a class first on your{" "}
                <Link href="/teacher" className="underline font-medium">dashboard</Link>{" "}
                before creating forecasts.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TEMPLATES.map((template, i) => (
                <div
                  key={i}
                  className={`bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 cursor-pointer hover:bg-[#00274C]/[0.04] transition-colors shadow-sm ${classList.length === 0 ? "opacity-50 pointer-events-none" : ""}`}
                  onClick={() => selectTemplate(template)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-semibold text-[#00274C]">{template.name}</h3>
                    <span className="tag tag-white">{template.type}</span>
                  </div>
                  <p className="text-sm text-[#00274C]/50">{template.description || "Custom forecast"}</p>
                  <div className="text-xs text-[#00274C]/25 mt-3">
                    {template.outcomes.length} outcomes
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Forecast Details */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-[#00274C]">Forecast Details</h2>
              <p className="text-sm text-[#00274C]/50 mt-1">Define the question and possible outcomes.</p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 space-y-4 shadow-sm">
              <div>
                <label className="text-sm font-medium text-[#00274C]/70">Class</label>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="input-dark mt-1 w-full"
                >
                  {classList.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-[#00274C]/70">Forecast Question</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Will >70% of students master probability by the next quiz?"
                  className="input-dark mt-1 w-full"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#00274C]/70">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional context about this forecast..."
                  className="input-dark mt-1 w-full min-h-[80px]"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#00274C]/70">Forecast Type</label>
                <div className="flex gap-2 mt-1">
                  {[
                    { value: "concept", label: "Concept Mastery" },
                    { value: "deadline", label: "Project Deadline" },
                    { value: "wellbeing", label: "Well-being" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        marketType === t.value
                          ? "bg-[#00274C] text-white"
                          : "btn-ghost"
                      }`}
                      onClick={() => setMarketType(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-[#00274C]/70">Outcomes</label>
                <div className="space-y-2 mt-1">
                  {outcomes.map((o, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={o.label}
                        onChange={(e) => updateOutcome(i, e.target.value)}
                        placeholder={`Outcome ${i + 1}`}
                        className="input-dark flex-1"
                      />
                      {outcomes.length > 2 && (
                        <button className="btn-ghost text-sm px-3" onClick={() => removeOutcome(i)}>
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                  {outcomes.length < 5 && (
                    <button className="btn-ghost text-sm" onClick={addOutcome}>
                      + Add Outcome
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button className="btn-ghost" onClick={() => setStep(1)}>Back</button>
              <button className="btn-primary" onClick={() => setStep(3)} disabled={!title || !classId || outcomes.some((o) => !o.label)}>
                Next: Parameters
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Parameters + Create */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-[#00274C]">Forecast Parameters</h2>
              <p className="text-sm text-[#00274C]/50 mt-1">Configure liquidity and trading limits.</p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-6 space-y-4 shadow-sm">
              <div>
                <label className="text-sm font-medium text-[#00274C]/70">
                  Liquidity Parameter (b)
                </label>
                <input
                  type="number"
                  value={bParam}
                  onChange={(e) => setBParam(Number(e.target.value))}
                  className="input-dark mt-1 w-full"
                />
                <p className="text-xs text-[#00274C]/25 mt-1">
                  Higher b = more liquidity, less price impact per trade. Default: 100
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-[#00274C]/70">Max Position Size</label>
                <input
                  type="number"
                  value={maxPosition}
                  onChange={(e) => setMaxPosition(Number(e.target.value))}
                  className="input-dark mt-1 w-full"
                />
                <p className="text-xs text-[#00274C]/25 mt-1">
                  Maximum shares a student can hold in one outcome.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-[#00274C]/70">Max Daily Spend</label>
                <input
                  type="number"
                  value={maxDailySpend}
                  onChange={(e) => setMaxDailySpend(Number(e.target.value))}
                  className="input-dark mt-1 w-full"
                />
                <p className="text-xs text-[#00274C]/25 mt-1">
                  Maximum coins a student can spend per day in this forecast.
                </p>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/12 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-[#00274C] mb-2">Preview</h3>
              <div className="text-sm text-[#00274C]/70 space-y-1">
                <p><strong className="text-[#00274C]">Class:</strong> {classList.find((c) => c.id === classId)?.name}</p>
                <p><strong className="text-[#00274C]">Question:</strong> {title}</p>
                <p><strong className="text-[#00274C]">Type:</strong> {marketType.charAt(0).toUpperCase() + marketType.slice(1)}</p>
                <p><strong className="text-[#00274C]">Outcomes:</strong> {outcomes.map((o) => o.label).join(", ")}</p>
                <p><strong className="text-[#00274C]">Parameters:</strong> b={bParam}, max_pos={maxPosition}, daily_max={maxDailySpend}</p>
              </div>
            </div>

            {error && (
              <div className="bg-[#D50032]/10 text-[#D50032] text-sm rounded-md p-3 border border-[#D50032]/20">{error}</div>
            )}

            <div className="flex gap-3">
              <button className="btn-ghost" onClick={() => setStep(2)}>Back</button>
              <button className="btn-primary" onClick={handleCreate} disabled={loading}>
                {loading ? "Creating..." : "Create Forecast"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
