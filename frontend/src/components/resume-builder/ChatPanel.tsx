"use client";

import React, { useState, useRef, useEffect } from "react";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
}

interface Props {
  onSendMessage: (message: string) => Promise<void>;
  onFileUpload: (file: File) => Promise<void>;
  messages: ChatMessage[];
  loading: boolean;
  mode?: "edit" | "analysis" | null;
}

/* ─── Simple Markdown Renderer ─────────────────────────────── */
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul
          key={`list-${elements.length}`}
          className="list-disc pl-5 my-1 space-y-0.5"
        >
          {listItems.map((item, i) => (
            <li key={i}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const formatInline = (line: string): React.ReactNode => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.*)/);

    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
    } else {
      flushList();
      if (line.trim() === "") {
        if (elements.length > 0) {
          elements.push(<div key={`br-${i}`} className="h-1" />);
        }
      } else {
        elements.push(
          <p key={`p-${i}`} className="mb-0.5">
            {formatInline(line)}
          </p>
        );
      }
    }
  }
  flushList();
  return elements;
}

export default function ChatPanel({
  onSendMessage,
  onFileUpload,
  messages,
  loading,
  mode,
}: Props) {
  const [input, setInput] = useState("");
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    await onSendMessage(msg);
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onFileUpload(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/80 backdrop-blur-xl">
      {/* Header */}
      <div className="p-5 border-b border-[#00274C]/6 flex-shrink-0">
        <h2 className="text-lg font-bold gradient-text mb-0.5">
          AI Resume Builder
        </h2>
        <p className="text-xs text-[#00274C]/40">
          Build, tailor, and review your resume with AI.
        </p>
        {mode && (
          <div
            className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium gap-1.5 ${
              mode === "edit"
                ? "bg-amber-100 text-amber-800 border border-amber-200"
                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                mode === "edit"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-emerald-500"
              }`}
            />
            <span>{mode === "edit" ? "Edit Mode" : "Analysis Mode"}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 text-sm">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === "user"
                  ? "bg-[#00274C] text-white rounded-br-none"
                  : "bg-white border border-[#00274C]/6 text-[#00274C]/80 rounded-bl-none"
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed">
                {msg.role === "agent"
                  ? renderMarkdown(msg.content)
                  : msg.content}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#00274C]/6 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#00274C]/30 animate-bounce" />
              <div
                className="w-2 h-2 rounded-full bg-[#00274C]/30 animate-bounce"
                style={{ animationDelay: "0.15s" }}
              />
              <div
                className="w-2 h-2 rounded-full bg-[#00274C]/30 animate-bounce"
                style={{ animationDelay: "0.3s" }}
              />
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-[#00274C]/6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="p-2.5 bg-[#00274C]/5 hover:bg-[#00274C]/10 text-[#00274C]/50 rounded-xl transition-colors disabled:opacity-50"
          title="Upload resume (.pdf, .docx, .txt)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.375 12.739l-7.693 7.693a4.536 4.536 0 01-6.416-6.416l10.82-10.82a2.809 2.809 0 013.974 3.974l-11.23 11.23a1.085 1.085 0 01-1.534-1.534l10.82-10.82"
            />
          </svg>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,.docx,.doc,.txt"
          className="hidden"
        />

        <form onSubmit={handleSubmit} className="relative flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Type to build or tailor your resume..."
            className="w-full pl-4 pr-12 py-3 bg-[#00274C]/[0.03] border border-[#00274C]/6 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00274C]/20 focus:border-[#00274C]/20 transition-all text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2 top-1.5 bottom-1.5 bg-[#00274C] hover:bg-[#1B365D] text-white rounded-lg px-3 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
