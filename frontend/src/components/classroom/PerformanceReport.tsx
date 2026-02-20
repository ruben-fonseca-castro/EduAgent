"use client";

import type { PerformanceReportResponse } from "@/lib/api";

interface PerformanceReportProps {
  report: PerformanceReportResponse;
  onBackToTeaching?: () => void;
}

export function PerformanceReport({ report, onBackToTeaching }: PerformanceReportProps) {
  const scoreColor =
    report.teaching_score >= 80 ? "#059669" :
    report.teaching_score >= 60 ? "#FFCB05" :
    "#D50032";

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="text-center py-6">
        <div className="relative inline-block">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#00274C10" strokeWidth="8" />
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke={scoreColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(report.teaching_score / 100) * 327} 327`}
              transform="rotate(-90 60 60)"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div>
              <div className="text-3xl font-bold text-[#00274C]">{Math.round(report.teaching_score)}</div>
              <div className="text-[10px] text-[#00274C]/30 uppercase tracking-wide">Score</div>
            </div>
          </div>
        </div>
      </div>

      {/* Strengths */}
      {report.strengths.length > 0 && (
        <div className="bg-emerald-50/50 border border-emerald-200/50 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span>&#x2705;</span> Strengths
          </h3>
          <ul className="space-y-1.5">
            {report.strengths.map((s, i) => (
              <li key={i} className="text-sm text-emerald-800/70 flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5 text-xs">&#x25CF;</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {report.weaknesses.length > 0 && (
        <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span>&#x1F4AA;</span> Areas to Improve
          </h3>
          <ul className="space-y-1.5">
            {report.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-amber-800/70 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 text-xs">&#x25CF;</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Topics */}
      <div className="grid grid-cols-2 gap-3">
        {report.topics_strong.length > 0 && (
          <div className="bg-[#00274C]/[0.03] rounded-xl p-3">
            <h4 className="text-[10px] font-semibold text-[#00274C]/40 uppercase tracking-wider mb-2">Strong Topics</h4>
            <div className="flex flex-wrap gap-1">
              {report.topics_strong.map((t, i) => (
                <span key={i} className="px-2 py-0.5 text-[11px] rounded-md bg-emerald-100/50 text-emerald-700 font-medium">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
        {report.topics_weak.length > 0 && (
          <div className="bg-[#00274C]/[0.03] rounded-xl p-3">
            <h4 className="text-[10px] font-semibold text-[#00274C]/40 uppercase tracking-wider mb-2">Needs Practice</h4>
            <div className="flex flex-wrap gap-1">
              {report.topics_weak.map((t, i) => (
                <span key={i} className="px-2 py-0.5 text-[11px] rounded-md bg-amber-100/50 text-amber-700 font-medium">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full report text */}
      {report.full_report_text && (
        <div className="bg-white border border-[#00274C]/6 rounded-xl p-4">
          <h4 className="text-[10px] font-semibold text-[#00274C]/40 uppercase tracking-wider mb-2">Detailed Analysis</h4>
          <p className="text-sm text-[#00274C]/60 leading-relaxed whitespace-pre-line">
            {report.full_report_text}
          </p>
        </div>
      )}

      {/* Back to Teaching */}
      {onBackToTeaching && (
        <button
          onClick={onBackToTeaching}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #00274C, #1B365D)", color: "white" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Teaching
        </button>
      )}
    </div>
  );
}
