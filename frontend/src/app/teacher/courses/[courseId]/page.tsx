"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/lib/auth";
import {
  courses as coursesApi,
  classroom as classroomApi,
  type CourseResponse,
  type MaterialResponse,
  type ClassroomAnalyticsResponse,
  type StudentReport,
  type StyleProfile,
  type ClassDemographics,
  type PerformanceReportSummary,
} from "@/lib/api";

// -- Helpers -----------------------------------------------------------------

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeIcon(type: string) {
  switch (type) {
    case "pdf":   return "PDF";
    case "image": return "IMG";
    case "video": return "VID";
    case "doc":   return "DOC";
    default:      return "FILE";
  }
}

function scoreColor(score: number) {
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-[#D50032]";
}

function scoreBarColor(score: number) {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-[#D50032]";
}

function engagementBadge(level: string) {
  switch (level) {
    case "high":   return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "medium": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    default:       return "bg-[#00274C]/4 text-[#00274C]/50 border-[#00274C]/10";
  }
}

const STYLE_LABELS: Record<string, string> = {
  uses_analogies:      "Analogies",
  uses_examples:       "Examples",
  breaks_down_steps:   "Step-by-Step",
  checks_understanding:"Checks Understanding",
  accuracy:            "Accuracy",
};

// -- Sub-components ----------------------------------------------------------

function StatCard({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className={`rounded-xl p-4 text-center ${color}`}>
      <p className="text-3xl font-bold leading-none mb-1">{value}</p>
      <p className="text-xs opacity-70 font-medium">{label}</p>
    </div>
  );
}

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const barColor = color ?? scoreBarColor(value);
  return (
    <div className="h-1.5 bg-[#00274C]/4 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StyleProfileBars({ profile }: { profile: StyleProfile | null | undefined }) {
  if (!profile) return <p className="text-xs text-[#00274C]/25 italic">No style data yet</p>;
  return (
    <div className="space-y-2">
      {Object.entries(profile).map(([key, val]) => (
        <div key={key}>
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-xs text-[#00274C]/50">{STYLE_LABELS[key] ?? key}</span>
            <span className="text-xs font-medium text-[#00274C]/70">{Math.round((val as number) * 100)}%</span>
          </div>
          <ScoreBar value={(val as number) * 100} color="bg-[#00274C]" />
        </div>
      ))}
    </div>
  );
}

function ScoreSparkline({ scores, dates }: { scores: number[]; dates: string[] }) {
  if (scores.length === 0) return <p className="text-xs text-[#00274C]/25 italic">No sessions yet</p>;
  const max = 100;
  const h = 40;
  const w = 120;
  const pts = scores.map((s, i) => {
    const x = scores.length === 1 ? w / 2 : (i / (scores.length - 1)) * w;
    const y = h - (s / max) * h;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="flex items-end gap-2">
      <svg width={w} height={h} className="flex-shrink-0">
        <polyline
          points={pts}
          fill="none"
          stroke="#00274C"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {scores.map((s, i) => {
          const x = scores.length === 1 ? w / 2 : (i / (scores.length - 1)) * w;
          const y = h - (s / max) * h;
          return <circle key={i} cx={x} cy={y} r="2.5" fill="#00274C" />;
        })}
      </svg>
      <div className="text-right">
        <p className={`text-lg font-bold ${scoreColor(scores[scores.length - 1])}`}>
          {Math.round(scores[scores.length - 1])}
        </p>
        <p className="text-[10px] text-[#00274C]/25">latest</p>
      </div>
    </div>
  );
}

function StudentCard({ report, defaultOpen = false }: { report: StudentReport; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [reportOpen, setReportOpen] = useState<string | null>(null);
  const trend = report.session_scores.length >= 2
    ? report.session_scores[report.session_scores.length - 1] - report.session_scores[0]
    : null;

  return (
    <div className="border border-[#00274C]/6 rounded-xl overflow-hidden bg-white/60">
      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#00274C]/[0.02] transition-colors text-left"
      >
        {/* Avatar circle */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00274C] to-[#1B365D] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {report.display_name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[#00274C] text-sm">{report.display_name}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${engagementBadge(report.engagement_level)}`}>
              {report.engagement_level} engagement
            </span>
            {report.quiz_completed ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-medium">
                Quiz ✓
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00274C]/4 text-[#00274C]/30 border border-[#00274C]/10 font-medium">
                No quiz
              </span>
            )}
            {report.grade_level && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 font-medium">
                {report.grade_level}
              </span>
            )}
            {trend !== null && (
              <span className={`text-[10px] font-medium ${trend >= 0 ? "text-emerald-600" : "text-[#D50032]"}`}>
                {trend >= 0 ? "↑" : "↓"} {Math.abs(Math.round(trend))} pts
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-[#00274C]/25">
              {report.total_sessions} session{report.total_sessions !== 1 ? "s" : ""} &middot; {report.total_messages} messages
            </p>
            {report.lessons_generated > 0 && (
              <p className="text-xs text-[#00274C]/25">
                {report.lessons_generated} lesson{report.lessons_generated !== 1 ? "s" : ""}
              </p>
            )}
            {report.last_session_at && (
              <p className="text-xs text-[#00274C]/25">
                Last: {new Date(report.last_session_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className={`text-xl font-bold ${scoreColor(report.avg_teaching_score)}`}>
            {Math.round(report.avg_teaching_score)}
          </p>
          <p className="text-[10px] text-[#00274C]/25">avg score</p>
        </div>

        <svg
          className={`w-4 h-4 text-[#00274C]/25 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-[#00274C]/6 px-5 py-4 space-y-5">
          {/* Learning style & profile info */}
          {(report.learning_style_summary || report.subjects.length > 0 || report.resume_uploaded) && (
            <div className="bg-[#FFCB05]/5 border border-[#FFCB05]/15 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-semibold text-[#00274C]/60 uppercase tracking-wide">Student Profile</p>
                {report.resume_uploaded && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 border border-violet-500/20 font-medium">
                    Resume uploaded
                  </span>
                )}
              </div>
              {report.learning_style_summary && (
                <div className="text-xs text-[#00274C]/70 leading-relaxed prose prose-xs max-w-none
                  [&_strong]:font-semibold [&_strong]:text-[#00274C]/90
                  [&_em]:italic [&_em]:text-[#00274C]/70
                  [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_ul]:mt-1
                  [&_li]:text-xs [&_li]:text-[#00274C]/60
                  [&_p]:mb-1 [&_p:last-child]:mb-0">
                  <ReactMarkdown>{report.learning_style_summary}</ReactMarkdown>
                </div>
              )}
              {report.subjects.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {report.subjects.map((s, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFCB05]/20 text-[#00274C]/70 border border-[#FFCB05]/30">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#00274C]/6 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-[#00274C]">{Math.round(report.best_teaching_score)}</p>
              <p className="text-[10px] text-[#00274C]/50">Best Score</p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-blue-600">{report.total_sessions}</p>
              <p className="text-[10px] text-blue-600/60">Sessions</p>
            </div>
            <div className="bg-violet-500/10 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-violet-600">{report.lessons_generated}</p>
              <p className="text-[10px] text-violet-600/60">Lessons</p>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-emerald-600">
                {report.total_sessions > 0 ? Math.round(report.total_messages / report.total_sessions) : 0}
              </p>
              <p className="text-[10px] text-emerald-600/60">Msgs / Session</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Score trend */}
            <div>
              <p className="text-xs font-semibold text-[#00274C]/50 mb-3 uppercase tracking-wide">Score Trend</p>
              <ScoreSparkline scores={report.session_scores} dates={report.session_dates} />
            </div>

            {/* Teaching style */}
            <div>
              <p className="text-xs font-semibold text-[#00274C]/50 mb-3 uppercase tracking-wide">Teaching Style</p>
              <StyleProfileBars profile={report.style_profile} />
            </div>
          </div>

          {/* Strengths & Improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.strengths.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-emerald-600 mb-2 uppercase tracking-wide">Strengths</p>
                <ul className="space-y-1">
                  {report.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#00274C]/50">
                      <span className="text-emerald-500 mt-0.5">✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.areas_to_improve.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-600 mb-2 uppercase tracking-wide">Areas to Improve</p>
                <ul className="space-y-1">
                  {report.areas_to_improve.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#00274C]/50">
                      <span className="text-amber-500 mt-0.5">→</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Topics covered */}
          {report.topics_covered.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#00274C]/50 mb-2 uppercase tracking-wide">Topics Covered</p>
              <div className="flex flex-wrap gap-1.5">
                {report.topics_covered.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#00274C]/6 text-[#00274C] border border-[#00274C]/12">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Performance Reports */}
          {report.performance_reports.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#00274C]/50 mb-3 uppercase tracking-wide">
                Performance Reports ({report.performance_reports.length})
              </p>
              <div className="space-y-2">
                {report.performance_reports.map((pr) => (
                  <div key={pr.id} className="border border-[#00274C]/6 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setReportOpen(reportOpen === pr.id ? null : pr.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#00274C]/[0.02] transition-colors text-left"
                    >
                      <span className={`text-sm font-bold ${scoreColor(pr.teaching_score)}`}>
                        {Math.round(pr.teaching_score)}
                      </span>
                      <span className="text-xs text-[#00274C]/40 flex-1">
                        {new Date(pr.created_at).toLocaleDateString()} — {pr.topics_strong.length} strong, {pr.topics_weak.length} weak topics
                      </span>
                      <svg
                        className={`w-3 h-3 text-[#00274C]/25 transition-transform ${reportOpen === pr.id ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {reportOpen === pr.id && (
                      <div className="px-3 pb-3 border-t border-[#00274C]/6 pt-2 space-y-2">
                        {pr.topics_strong.length > 0 && (
                          <div>
                            <p className="text-[10px] text-emerald-600 font-semibold mb-1">Strong Topics</p>
                            <div className="flex flex-wrap gap-1">
                              {pr.topics_strong.map((t, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {pr.topics_weak.length > 0 && (
                          <div>
                            <p className="text-[10px] text-[#D50032] font-semibold mb-1">Weak Topics</p>
                            <div className="flex flex-wrap gap-1">
                              {pr.topics_weak.map((t, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-[#D50032]">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {pr.strengths.length > 0 && (
                            <div>
                              <p className="text-[10px] text-emerald-600 font-semibold mb-1">Strengths</p>
                              <ul className="space-y-0.5">
                                {pr.strengths.slice(0, 3).map((s, i) => (
                                  <li key={i} className="text-[10px] text-[#00274C]/40">• {s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {pr.weaknesses.length > 0 && (
                            <div>
                              <p className="text-[10px] text-amber-600 font-semibold mb-1">Weaknesses</p>
                              <ul className="space-y-0.5">
                                {pr.weaknesses.slice(0, 3).map((s, i) => (
                                  <li key={i} className="text-[10px] text-[#00274C]/40">• {s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DistributionBar({ distribution }: { distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-xs text-[#00274C]/25 italic">No data yet</p>;

  const buckets = [
    { label: "0–20",   color: "bg-red-400",    keys: ["0-20"] },
    { label: "21–40",  color: "bg-orange-400",  keys: ["21-40"] },
    { label: "41–60",  color: "bg-amber-400",   keys: ["41-60"] },
    { label: "61–80",  color: "bg-lime-500",    keys: ["61-80"] },
    { label: "81–100", color: "bg-emerald-500", keys: ["81-100"] },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-6 rounded-lg overflow-hidden gap-0.5">
        {buckets.map(({ label, color, keys }) => {
          const count = keys.reduce((acc, k) => acc + (distribution[k] ?? 0), 0);
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={label}
              className={`${color} flex items-center justify-center text-[10px] text-white font-bold`}
              style={{ width: `${pct}%` }}
              title={`${label}: ${count} session${count !== 1 ? "s" : ""}`}
            >
              {pct >= 15 ? count : ""}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 flex-wrap">
        {buckets.map(({ label, color, keys }) => {
          const count = keys.reduce((acc, k) => acc + (distribution[k] ?? 0), 0);
          if (count === 0) return null;
          return (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-sm ${color}`} />
              <span className="text-[10px] text-[#00274C]/50">{label}: <strong>{count}</strong></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Main Page ---------------------------------------------------------------

export default function TeacherCourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();

  const [course, setCourse] = useState<CourseResponse | null>(null);
  const [materials, setMaterials] = useState<MaterialResponse[]>([]);
  const [analytics, setAnalytics] = useState<ClassroomAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "students" | "materials">("overview");
  const [studentSearch, setStudentSearch] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "name" | "sessions" | "lessons">("score");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token || !user) { router.push("/login"); return; }
    if (user.role !== "teacher") { router.push("/student"); return; }
    loadData();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [authLoading, token, user, courseId]);

  // Poll for material processing status
  useEffect(() => {
    const hasProcessing = materials.some((m) => m.status === "processing");
    if (hasProcessing) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => loadMaterials(), 3000);
      }
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [materials]);

  const loadData = async () => {
    if (!token) return;
    try {
      const [courseData, matsData, analyticsData] = await Promise.all([
        coursesApi.get(token, courseId),
        coursesApi.listMaterials(token, courseId),
        classroomApi.analytics(token, courseId).catch(() => null),
      ]);
      setCourse(courseData);
      setMaterials(matsData.materials);
      setAnalytics(analyticsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMaterials = async () => {
    if (!token) return;
    try {
      const matsData = await coursesApi.listMaterials(token, courseId);
      setMaterials(matsData.materials);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !token) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        await coursesApi.uploadMaterial(token, courseId, file);
      }
      loadMaterials();
    } catch (e: any) {
      setUploadError(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  const handleDelete = async (materialId: string) => {
    if (!token) return;
    try {
      await coursesApi.deleteMaterial(token, courseId, materialId);
      loadMaterials();
    } catch (e) {
      console.error(e);
    }
  };

  // Sorted + filtered students
  const filteredStudents = (analytics?.student_reports ?? [])
    .filter((s) => s.display_name.toLowerCase().includes(studentSearch.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "score") return b.avg_teaching_score - a.avg_teaching_score;
      if (sortBy === "sessions") return b.total_sessions - a.total_sessions;
      if (sortBy === "lessons") return b.lessons_generated - a.lessons_generated;
      return a.display_name.localeCompare(b.display_name);
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex items-center justify-center">
        <div className="animate-pulse text-[#00274C]/40 text-sm">Loading course...</div>
      </div>
    );
  }

  const a = analytics;
  const readyMaterials = materials.filter((m) => m.status === "ready").length;
  const processingMaterials = materials.filter((m) => m.status === "processing").length;

  return (
    <div className="min-h-screen bg-[#FAFBFD] relative">

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/teacher/courses" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="w-px h-5 bg-[#00274C]/6" />
            <h1 className="text-base font-semibold text-[#00274C] truncate">{course?.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="tag tag-white text-[10px] hidden sm:flex">
              {readyMaterials} material{readyMaterials !== 1 ? "s" : ""} ready
            </span>
            {processingMaterials > 0 && (
              <span className="tag tag-amber text-[10px] animate-pulse">
                {processingMaterials} processing...
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white/60 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-0 -mb-px">
            {(["overview", "students", "materials"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? "border-[#00274C] text-[#00274C]"
                    : "border-transparent text-[#00274C]/40 hover:text-[#00274C]/60 hover:border-[#00274C]/10"
                }`}
              >
                {tab}
                {tab === "students" && a && (
                  <span className="ml-1.5 text-[10px] bg-[#00274C]/8 text-[#00274C] px-1.5 py-0.5 rounded-full">
                    {a.active_students}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* -- Overview Tab -------------------------------------------------- */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Top stat cards */}
            {a ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  <StatCard value={a.total_sessions}                          label="Total Sessions"         color="bg-blue-500/10 text-blue-600" />
                  <StatCard value={a.active_students}                         label="Active Students"        color="bg-violet-500/10 text-violet-600" />
                  <StatCard value={Math.round(a.avg_teaching_score)}          label="Avg Score"              color="bg-[#00274C]/6 text-[#00274C]" />
                  <StatCard value={a.total_messages}                          label="Total Messages"         color="bg-cyan-500/10 text-cyan-600" />
                  <StatCard value={a.avg_messages_per_session?.toFixed(1) ?? "—"} label="Msgs / Session"   color="bg-teal-500/10 text-teal-600" />
                  <StatCard value={materials.length}                          label="Materials"              color="bg-orange-500/10 text-orange-600" />
                  <StatCard value={a.class_demographics?.total_lessons_generated ?? 0} label="Lessons Generated" color="bg-pink-500/10 text-pink-600" />
                  <StatCard value={a.class_demographics?.total_performance_reports ?? 0} label="Reports" color="bg-indigo-500/10 text-indigo-600" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Score distribution */}
                  <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 lg:col-span-2 shadow-sm">
                    <h3 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-4">Score Distribution</h3>
                    <DistributionBar distribution={a.score_distribution ?? {}} />
                  </div>

                  {/* Engagement breakdown */}
                  <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-4">Engagement Levels</h3>
                    <div className="space-y-3">
                      {[
                        { label: "High",   count: a.high_engagement_count ?? 0,   color: "bg-emerald-500" },
                        { label: "Medium", count: a.medium_engagement_count ?? 0, color: "bg-amber-500" },
                        { label: "Low",    count: a.low_engagement_count ?? 0,    color: "bg-red-400" },
                      ].map(({ label, count, color }) => {
                        const total = (a.high_engagement_count ?? 0) + (a.medium_engagement_count ?? 0) + (a.low_engagement_count ?? 0);
                        const pct = total > 0 ? (count / total) * 100 : 0;
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-[#00274C]/50">{label}</span>
                              <span className="font-medium text-[#00274C]/70">{count} students</span>
                            </div>
                            <div className="h-2 bg-[#00274C]/4 rounded-full overflow-hidden">
                              <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Class-wide style profile */}
                {a.class_style_profile && (
                  <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-1">Class-Wide Teaching Style Profile</h3>
                    <p className="text-xs text-[#00274C]/25 mb-4">Aggregate across all students</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                      {Object.entries(a.class_style_profile).map(([key, val]) => (
                        <div key={key} className="text-center">
                          <div className="relative w-16 h-16 mx-auto mb-2">
                            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(0,39,76,0.05)" strokeWidth="3" />
                              <circle
                                cx="18" cy="18" r="15.9" fill="none"
                                stroke="#00274C" strokeWidth="3"
                                strokeDasharray={`${(val as number) * 100} 100`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[#00274C]">
                              {Math.round((val as number) * 100)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-[#00274C]/50 text-center">{STYLE_LABELS[key] ?? key}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Common topics */}
                {a.common_topics.length > 0 && (
                  <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-4">Most-Taught Topics</h3>
                    <div className="flex flex-wrap gap-2">
                      {a.common_topics.map((topic, i) => (
                        <span key={i} className="text-xs px-3 py-1 rounded-full bg-[#00274C]/6 text-[#00274C] border border-[#00274C]/12">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Class Demographics */}
                {a.class_demographics && (
                  <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-1">Class Demographics</h3>
                    <p className="text-xs text-[#00274C]/25 mb-4">Student identity quiz & lesson data</p>

                    {/* Top-level stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                      <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-blue-600">{a.class_demographics.total_students}</p>
                        <p className="text-[10px] text-blue-600/60">Students</p>
                      </div>
                      <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-emerald-600">
                          {Math.round(a.class_demographics.quiz_completion_rate * 100)}%
                        </p>
                        <p className="text-[10px] text-emerald-600/60">Quiz Completed</p>
                      </div>
                      <div className="bg-violet-500/10 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-violet-600">{a.class_demographics.total_lessons_generated}</p>
                        <p className="text-[10px] text-violet-600/60">Lessons Generated</p>
                      </div>
                      <div className="bg-[#FFCB05]/15 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-[#00274C]">
                          {a.class_demographics.avg_report_score > 0 ? Math.round(a.class_demographics.avg_report_score) : "—"}
                        </p>
                        <p className="text-[10px] text-[#00274C]/50">Avg Report Score</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Quiz completion progress */}
                      <div>
                        <p className="text-xs text-[#00274C]/50 font-medium mb-2">Quiz Completion</p>
                        <div className="h-3 bg-[#00274C]/4 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${a.class_demographics.quiz_completion_rate * 100}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-[#00274C]/25">
                            {Math.round(a.class_demographics.quiz_completion_rate * a.class_demographics.total_students)} completed
                          </span>
                          <span className="text-[10px] text-[#00274C]/25">
                            {a.class_demographics.total_students - Math.round(a.class_demographics.quiz_completion_rate * a.class_demographics.total_students)} remaining
                          </span>
                        </div>
                      </div>

                      {/* Grade level distribution */}
                      {Object.keys(a.class_demographics.grade_distribution).length > 0 && (
                        <div>
                          <p className="text-xs text-[#00274C]/50 font-medium mb-2">Grade Levels</p>
                          <div className="space-y-1.5">
                            {Object.entries(a.class_demographics.grade_distribution)
                              .sort(([, a_count], [, b_count]) => b_count - a_count)
                              .map(([grade, count]) => {
                                const pct = a.class_demographics
                                  ? (count / a.class_demographics.total_students) * 100
                                  : 0;
                                return (
                                  <div key={grade}>
                                    <div className="flex justify-between text-[10px] mb-0.5">
                                      <span className="text-[#00274C]/50 capitalize">{grade.replace("_", " ")}</span>
                                      <span className="text-[#00274C]/70 font-medium">{count}</span>
                                    </div>
                                    <div className="h-1.5 bg-[#00274C]/4 rounded-full overflow-hidden">
                                      <div className="h-full bg-[#00274C] rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Common subjects */}
                    {a.class_demographics.common_subjects.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-[#00274C]/50 font-medium mb-2">Popular Subjects</p>
                        <div className="flex flex-wrap gap-2">
                          {a.class_demographics.common_subjects.map((subj, i) => (
                            <span
                              key={i}
                              className="text-xs px-3 py-1 rounded-full bg-[#FFCB05]/15 text-[#00274C]/70 border border-[#FFCB05]/25"
                            >
                              {subj}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lessons per student */}
                    <div className="mt-4 flex items-center gap-4 text-xs text-[#00274C]/40">
                      <span>
                        Avg <strong className="text-[#00274C]/70">{a.class_demographics.avg_lessons_per_student}</strong> lessons/student
                      </span>
                      <span>•</span>
                      <span>
                        <strong className="text-[#00274C]/70">{a.class_demographics.total_performance_reports}</strong> performance reports
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-20 text-[#00274C]/25">
                <svg className="mx-auto mb-3" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 20V10M12 20V4M6 20v-6" />
                </svg>
                <p className="text-sm">No student activity yet.</p>
                <p className="text-xs mt-1">Analytics will appear once students start classroom sessions.</p>
              </div>
            )}
          </div>
        )}

        {/* -- Students Tab -------------------------------------------------- */}
        {activeTab === "students" && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                placeholder="Search students..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="input-dark flex-1 min-w-[200px]"
              />
              <div className="flex items-center gap-2 text-xs text-[#00274C]/50">
                <span>Sort:</span>
                {(["score", "name", "sessions", "lessons"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`px-3 py-1.5 rounded-full border capitalize transition-colors ${
                      sortBy === s
                        ? "bg-[#00274C] text-white border-[#00274C]"
                        : "border-[#00274C]/10 text-[#00274C]/50 hover:border-[#00274C]/20"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="text-center py-20 text-[#00274C]/25">
                <p className="text-sm">{analytics ? "No students match your search." : "No student activity yet."}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStudents.map((report, i) => (
                  <StudentCard key={report.user_id} report={report} defaultOpen={i === 0 && filteredStudents.length === 1} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* -- Materials Tab -------------------------------------------------- */}
        {activeTab === "materials" && (
          <div className="space-y-5">
            {/* Upload zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`drop-zone p-10 text-center cursor-pointer ${dragOver ? "drag-over" : ""}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.avi,.webm,.doc,.docx,.txt,.md"
                onChange={(e) => handleUpload(e.target.files)}
                className="hidden"
              />
              <svg className="mx-auto text-[#00274C]/25 mb-3" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-sm font-medium text-[#00274C]/50">
                {uploading ? "Uploading..." : "Drop files here or click to upload"}
              </p>
              <p className="text-xs text-[#00274C]/25 mt-1">PDF, Images, Videos, Documents &mdash; max 50 MB each</p>
              {uploadError && <p className="text-sm text-[#D50032] mt-3">{uploadError}</p>}
            </div>

            {/* Materials list */}
            {materials.length === 0 ? (
              <p className="text-center text-sm text-[#00274C]/25 py-8">
                No materials uploaded yet. Upload files above to provide RAG context.
              </p>
            ) : (
              <div className="space-y-2">
                {materials.map((mat) => (
                  <div key={mat.id} className="flex items-center gap-3 bg-white/60 border border-[#00274C]/6 rounded-xl px-4 py-3">
                    {/* File type badge */}
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                      mat.file_type === "pdf"   ? "bg-red-500/10 text-[#D50032]" :
                      mat.file_type === "image" ? "bg-green-500/10 text-green-600" :
                      mat.file_type === "video" ? "bg-purple-500/10 text-purple-600" :
                      "bg-[#00274C]/4 text-[#00274C]/50"
                    }`}>
                      {fileTypeIcon(mat.file_type)}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#00274C] truncate">{mat.filename}</p>
                      <p className="text-xs text-[#00274C]/25">
                        {formatSize(mat.file_size)} &middot; {new Date(mat.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Status */}
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium border ${
                      mat.status === "ready"      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                      mat.status === "processing" ? "bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse" :
                                                    "bg-red-500/10 text-[#D50032] border-red-500/20"
                    }`}>
                      {mat.status === "ready" ? "Ready" : mat.status === "processing" ? "Processing..." : "Error"}
                    </span>

                    {mat.error_message && (
                      <span className="text-xs text-[#D50032] max-w-[150px] truncate" title={mat.error_message}>
                        {mat.error_message}
                      </span>
                    )}

                    <button
                      onClick={() => handleDelete(mat.id)}
                      className="text-[#00274C]/25 hover:text-[#D50032] transition-colors flex-shrink-0"
                      title="Delete material"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Course info */}
            {course?.description && (
              <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-[#00274C]/50 uppercase tracking-wider mb-3">Course Description</h3>
                <p className="text-sm text-[#00274C]/50">{course.description}</p>
                <p className="text-xs text-[#00274C]/25 mt-2">
                  Created {new Date(course.created_at).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
