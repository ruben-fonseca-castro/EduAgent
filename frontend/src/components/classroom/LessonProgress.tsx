"use client";

import { useState, useEffect, useRef } from "react";
import { lessons } from "@/lib/api";

const PIPELINE_NODES = [
  { key: "starting", label: "Starting", icon: "..." },
  { key: "parse_input", label: "Analyzing Topic", icon: "1" },
  { key: "plan_lesson", label: "Planning Lesson", icon: "2" },
  { key: "retrieve_student_context", label: "Loading Your Context", icon: "3" },
  { key: "generate_content", label: "Writing Content", icon: "4" },
  { key: "generate_figures", label: "Creating Figures", icon: "5" },
  { key: "assemble_html", label: "Assembling Lesson", icon: "6" },
  { key: "review_lesson", label: "Quality Review", icon: "7" },
];

interface LessonProgressProps {
  lessonId: string;
  token: string;
  onComplete: () => void;
  onError: (message: string) => void;
}

export function LessonProgress({ lessonId, token, onComplete, onError }: LessonProgressProps) {
  const [currentNode, setCurrentNode] = useState("starting");
  const [message, setMessage] = useState("Initializing lesson generation...");
  const [planTitle, setPlanTitle] = useState("");
  const [objectives, setObjectives] = useState<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = `${lessons.streamUrl(lessonId)}?token=${token}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const evt = data.event || data.type;

        if (evt === "status") {
          setCurrentNode(data.data?.node || "");
          setMessage(data.data?.message || "");
        } else if (evt === "plan") {
          setPlanTitle(data.data?.title || "");
          setObjectives(data.data?.objectives || []);
        } else if (evt === "complete") {
          es.close();
          onComplete();
        } else if (evt === "error") {
          es.close();
          onError(data.data?.message || "Generation failed");
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      // SSE might disconnect — check lesson status directly
      setTimeout(async () => {
        try {
          const lesson = await lessons.get(token, lessonId);
          if (lesson.status === "ready") {
            es.close();
            onComplete();
          } else if (lesson.status === "error") {
            es.close();
            onError(lesson.error_message || "Generation failed");
          }
        } catch {
          // Retry will happen on next onerror
        }
      }, 2000);
    };

    return () => {
      es.close();
    };
  }, [lessonId, token, onComplete, onError]);

  const currentIdx = PIPELINE_NODES.findIndex(n => n.key === currentNode);

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#00274C] to-[#1B365D] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-[#00274C] mb-1">Generating Your Lesson</h2>
        <p className="text-sm text-[#00274C]/40">{message}</p>
      </div>

      {/* Plan preview */}
      {planTitle && (
        <div className="bg-[#FFCB05]/5 border border-[#FFCB05]/20 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-[#00274C] text-sm mb-2">{planTitle}</h3>
          {objectives.length > 0 && (
            <ul className="space-y-1">
              {objectives.slice(0, 4).map((obj, i) => (
                <li key={i} className="text-xs text-[#00274C]/60 flex items-start gap-2">
                  <span className="text-[#FFCB05] mt-0.5">&#x2713;</span>
                  {obj}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Pipeline nodes */}
      <div className="space-y-2">
        {PIPELINE_NODES.map((node, i) => {
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          const isPending = i > currentIdx;

          return (
            <div
              key={node.key}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                isActive ? "bg-[#00274C]/5" : ""
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                isDone ? "bg-[#FFCB05] text-[#00274C]"
                  : isActive ? "bg-[#00274C] text-white"
                  : "bg-[#00274C]/5 text-[#00274C]/20"
              }`}>
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : isActive ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  node.icon
                )}
              </div>
              <span className={`text-sm font-medium transition-all ${
                isDone ? "text-[#00274C]/40" : isActive ? "text-[#00274C]" : "text-[#00274C]/20"
              }`}>
                {node.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
