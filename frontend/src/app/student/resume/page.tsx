"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resumeBuilder as api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ResumeViewer, {
  type ResumeState,
  type Suggestion,
} from "@/components/resume-builder/ResumeViewer";
import ChatPanel from "@/components/resume-builder/ChatPanel";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
}

export default function ResumeBuilderPage() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [resumeData, setResumeData] = useState<ResumeState | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastMode, setLastMode] = useState<"edit" | "analysis" | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [exporting, setExporting] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const resumeRef = useRef<HTMLDivElement>(null);

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!token || !user) {
      router.push("/login");
      return;
    }
    if (user.role !== "student") {
      router.push("/teacher");
      return;
    }
    loadAll();
  }, [authLoading, token, user]);

  const loadAll = async () => {
    if (!token) return;
    setInitialLoading(true);
    try {
      const [resumeRes, suggestionsRes, historyRes] = await Promise.all([
        api.getResume(token),
        api.getSuggestions(token),
        api.getChatHistory(token),
      ]);
      setResumeData(resumeRes as ResumeState);
      setSuggestions(
        (suggestionsRes as Suggestion[]).filter(
          (s) => s.originalText && s.proposedText
        )
      );

      const history = historyRes as { role: string; content: string }[];
      if (history && history.length > 0) {
        setMessages(history.map((m) => ({ role: m.role as "user" | "agent", content: m.content })));
      } else {
        setMessages([
          {
            role: "agent",
            content:
              "Hello! I'm your AI Resume Builder. Upload your resume or ask me to help build one from scratch. I can also tailor it for specific job descriptions.",
          },
        ]);
      }

      // Auto-seed from onboarding upload if resume is empty
      if (resumeRes._has_uploaded_text && !resumeRes.basics?.name) {
        try {
          setLoading(true);
          const seedResult = await api.seedFromUpload(token);
          if (seedResult.status === "seeded" && seedResult.reply) {
            setMessages((prev) => [
              ...prev,
              { role: "agent", content: seedResult.reply },
            ]);
            // Reload data
            const [newResume, newSuggestions] = await Promise.all([
              api.getResume(token),
              api.getSuggestions(token),
            ]);
            setResumeData(newResume as ResumeState);
            setSuggestions(
              (newSuggestions as Suggestion[]).filter(
                (s) => s.originalText && s.proposedText
              )
            );
          }
        } catch {
          // Seed failed — not critical
        } finally {
          setLoading(false);
        }
      }
    } catch (e) {
      console.error("Failed to load resume builder data:", e);
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchResume = async () => {
    if (!token) return;
    try {
      const data = await api.getResume(token);
      setResumeData(data as ResumeState);
    } catch (e) {
      console.error("Failed to fetch resume:", e);
    }
  };

  const fetchSuggestions = async () => {
    if (!token) return;
    try {
      const data = await api.getSuggestions(token);
      setSuggestions(
        (data as Suggestion[]).filter((s) => s.originalText && s.proposedText)
      );
    } catch (e) {
      console.error("Failed to fetch suggestions:", e);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!token) return;
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);

    try {
      const chatRes = await api.chat(token, message);
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: chatRes.reply },
      ]);
      if (chatRes.mode) {
        setLastMode(chatRes.mode as "edit" | "analysis");
      }
      await fetchResume();
      await fetchSuggestions();
    } catch (e) {
      console.error("Chat error:", e);
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!token) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `[Uploaded File: ${file.name}]` },
    ]);
    setLoading(true);

    try {
      const data = await api.upload(token, file);
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: data.reply },
      ]);
      if (data.mode) {
        setLastMode(data.mode as "edit" | "analysis");
      }
      await fetchResume();
      await fetchSuggestions();
    } catch (e) {
      console.error("Upload error:", e);
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: "Sorry, I had trouble processing that file.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleUpdateSection = async (section: keyof ResumeState, newContent: any) => {
    if (!token) return;
    setResumeData((prev) =>
      prev ? { ...prev, [section]: newContent } : null
    );
    try {
      await api.updateSection(token, section, newContent);
    } catch (e) {
      console.error(`Failed to update ${section}:`, e);
      await fetchResume();
    }
  };

  const handleApprove = async (id: string) => {
    if (!token) return;
    try {
      await api.approveSuggestion(token, id);
      await fetchSuggestions();
      await fetchResume();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReject = async (id: string) => {
    if (!token) return;
    try {
      await api.rejectSuggestion(token, id);
      await fetchSuggestions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleApproveAll = async () => {
    if (!token) return;
    try {
      await api.approveAll(token);
      await fetchSuggestions();
      await fetchResume();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRejectAll = async () => {
    if (!token) return;
    try {
      await api.rejectAll(token);
      await fetchSuggestions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReset = async () => {
    if (!token) return;
    if (!window.confirm("Reset your resume and chat? This cannot be undone.")) return;
    try {
      await api.reset(token);
      setResumeData({
        basics: { name: "", email: "", phone: "", linkedin: "", github: "" },
        education: [],
        experience: [],
        projects: [],
        skills: { languages: [], frameworks: [], tools: [], softSkills: [] },
      });
      setSuggestions([]);
      setMessages([
        {
          role: "agent",
          content:
            "Hello! I'm your AI Resume Builder. Upload your resume or ask me to help build one from scratch. I can also tailor it for specific job descriptions.",
        },
      ]);
    } catch (e) {
      console.error("Reset failed:", e);
    }
  };

  const handleExportPdf = async () => {
    if (!resumeRef.current || exporting) return;
    setExporting(true);
    try {
      const source = resumeRef.current;

      const deepCloneInlined = (node: Node): Node => {
        if (node instanceof HTMLElement) {
          if (node.classList.contains("no-print")) {
            return document.createDocumentFragment();
          }
          const clone = node.cloneNode(false) as HTMLElement;
          const computed = getComputedStyle(node);
          let css = "";
          for (let i = 0; i < computed.length; i++) {
            const prop = computed[i];
            css += `${prop}:${computed.getPropertyValue(prop)};`;
          }
          clone.removeAttribute("class");
          clone.removeAttribute("contenteditable");
          clone.setAttribute("style", css);

          for (const child of node.childNodes) {
            const clonedChild = deepCloneInlined(child);
            clone.appendChild(clonedChild);
          }
          return clone;
        }
        return node.cloneNode(true);
      };

      const clonedContent = deepCloneInlined(source) as HTMLElement;

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.width = "210mm";
      iframe.style.height = "297mm";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html>
        <html><head>
          <title>${resumeData?.basics?.name || "Resume"}</title>
          <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { margin: 0; padding: 0; }
          </style>
        </head><body></body></html>`);
      iframeDoc.close();
      iframeDoc.body.appendChild(clonedContent);

      await new Promise((r) => setTimeout(r, 500));
      iframe.contentWindow!.print();

      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  if (authLoading || initialLoading) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex items-center justify-center">
        <div className="animate-pulse text-[#00274C]/30 text-sm">
          Loading Resume Builder...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFBFD] flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6 flex-shrink-0">
        <div className="max-w-full mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/student"
              className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="w-px h-5 bg-[#00274C]/6" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00274C] to-[#1B365D] flex items-center justify-center">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <h1 className="text-base font-bold gradient-text">
                Resume Builder
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Export PDF button */}
            <button
              onClick={handleExportPdf}
              disabled={exporting || !resumeData?.basics?.name}
              className="btn-ghost text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-30"
            >
              {exporting ? (
                <span>Exporting...</span>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-3.5 h-3.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  <span>Export PDF</span>
                </>
              )}
            </button>
            {/* Reset button */}
            <button
              onClick={handleReset}
              className="btn-ghost text-xs px-3 py-2 flex items-center gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50"
              title="Reset resume and chat"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
                />
              </svg>
              <span>Reset</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout — Resume Left, Chat Right */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Resume Canvas */}
        <div className="flex-1 overflow-y-auto bg-gray-100/50 flex items-start justify-center p-6">
          <div className="w-full max-w-[210mm] mx-auto flex flex-col gap-3 mb-8">
            {/* Suggestion Action Bar */}
            {suggestions.length > 0 && (
              <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/60 px-4 py-2.5 rounded-xl shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                  <span className="text-sm font-medium text-blue-900">
                    {suggestions.length} AI suggestion
                    {suggestions.length !== 1 ? "s" : ""} ready
                  </span>
                </div>
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={handleApproveAll}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg shadow-sm transition-all"
                  >
                    Accept All
                  </button>
                  <button
                    onClick={handleRejectAll}
                    className="px-3 py-1 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium rounded-lg border border-gray-200 shadow-sm transition-all"
                  >
                    Dismiss All
                  </button>
                </div>
              </div>
            )}

            {/* Overflow warning */}
            {isOverflowing && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/60 px-4 py-2 rounded-xl text-amber-800 text-xs font-medium">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4 flex-shrink-0"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <span>
                  Resume exceeds one page — ask the AI to condense it, or
                  shorten entries manually.
                </span>
              </div>
            )}

            <div ref={resumeRef}>
              <ResumeViewer
                data={resumeData}
                onUpdate={handleUpdateSection}
                suggestions={suggestions}
                onApprove={handleApprove}
                onReject={handleReject}
                onOverflowChange={setIsOverflowing}
                onFileUpload={handleFileUpload}
              />
            </div>
          </div>
        </div>

        {/* Right: Chat Panel */}
        <div className="w-[420px] flex-shrink-0 h-full flex flex-col border-l border-[#00274C]/6 shadow-lg z-10">
          <ChatPanel
            onSendMessage={handleSendMessage}
            onFileUpload={handleFileUpload}
            messages={messages}
            loading={loading}
            mode={lastMode}
          />
        </div>
      </div>
    </div>
  );
}
