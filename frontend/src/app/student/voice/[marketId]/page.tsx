"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { AgentMessage } from "@/components/AgentMessage";
import {
  voice as voiceApi,
  markets as marketsApi,
  type VoiceSessionResponse,
  type VoiceMessageResponse,
  type MarketResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function VoiceRoomPage({ params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = use(params);
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [session, setSession] = useState<VoiceSessionResponse | null>(null);
  const [messages, setMessages] = useState<Array<{
    role: string;
    content: string;
    agent_name?: string;
    persona?: string;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.push("/login"); return; }
    initSession();
  }, [authLoading, token, marketId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const initSession = async () => {
    if (!token) return;
    try {
      const [mkt, sess] = await Promise.all([
        marketsApi.get(token, marketId),
        voiceApi.createSession(token, { market_id: marketId }),
      ]);
      setMarket(mkt);
      setSession(sess);
      setMessages(sess.messages || []);
    } catch (e) {
      console.error(e);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleTranscript = async (text: string) => {
    if (!token || !session) return;
    setLoading(true);

    // Add user message immediately
    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response: VoiceMessageResponse = await voiceApi.sendMessage(token, {
        session_id: session.id,
        text,
      });

      // Add agent responses
      const agentMsgs = response.agent_responses.map((r) => ({
        role: "assistant",
        content: r.message,
        agent_name: r.agent_name,
        persona: r.persona,
      }));
      setMessages((prev) => [...prev, ...agentMsgs]);

      if (response.checklist) {
        setSession((prev) => prev ? { ...prev, checklist: response.checklist || null } : null);
      }
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, there was an error processing your message.", agent_name: "System", persona: "system" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (!token || !session) return;
    setLoading(true);
    try {
      const updated = await voiceApi.summarize(token, session.id);
      setSession(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex items-center justify-center">
        <div className="animate-pulse text-[#00274C]/40">Loading voice room...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFBFD] relative flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-[#00274C]/6">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href={`/student/markets/${marketId}`} className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="w-px h-5 bg-[#00274C]/6" />
          <h1 className="text-sm font-semibold text-[#00274C] truncate">
            Voice Room: {market?.title || "Loading..."}
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 flex flex-col relative">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
          {/* Chat area */}
          <div className="lg:col-span-2 flex flex-col">
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl flex-1 flex flex-col p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[#00274C] mb-3">Conversation</h3>
              <div className="flex-1 overflow-y-auto max-h-[60vh] space-y-3 pr-2">
                {messages.length === 0 && (
                  <div className="text-center text-[#00274C]/25 py-8">
                    <p className="text-sm">Start by asking a question about this topic.</p>
                    <p className="text-xs mt-1">AI agents will respond with different perspectives to challenge and help you learn.</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i}>
                    {msg.role === "user" ? (
                      <div className="bg-[#00274C]/4 rounded-lg p-3 ml-8">
                        <span className="text-xs font-medium text-[#00274C]/50">You</span>
                        <p className="text-sm text-[#00274C] mt-0.5">{msg.content}</p>
                      </div>
                    ) : (
                      <AgentMessage
                        agentName={msg.agent_name || "Agent"}
                        persona={msg.persona || "system"}
                        message={msg.content}
                      />
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-[#00274C]/40 text-sm">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-[#00274C]/30 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 bg-[#00274C]/30 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 bg-[#00274C]/30 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    Agents are thinking...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Voice input */}
            <div className="mt-4">
              <VoiceRecorder onTranscript={handleTranscript} disabled={loading} />
            </div>
          </div>

          {/* Sidebar: Agents + Checklist */}
          <div className="space-y-4">
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[#00274C] mb-3">AI Agents</h3>
              <div className="space-y-2 text-xs text-[#00274C]/70">
                <div className="flex items-center gap-2"><span>🏛️</span> <strong className="text-[#00274C]">Socratic Examiner</strong> — Probing questions</div>
                <div className="flex items-center gap-2"><span>📚</span> <strong className="text-[#00274C]">Friendly Tutor</strong> — Gentle explanations</div>
                <div className="flex items-center gap-2"><span>🔍</span> <strong className="text-[#00274C]">Skeptic</strong> — Counterexamples</div>
                <div className="flex items-center gap-2"><span>🎯</span> <strong className="text-[#00274C]">Practical Coach</strong> — Action steps</div>
                <div className="flex items-center gap-2"><span>👩‍🏫</span> <strong className="text-[#00274C]">Teacher Proxy</strong> — Rubric alignment</div>
              </div>
            </div>

            {/* Study Checklist */}
            <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#00274C]">Study Checklist</h3>
                <button className="btn-ghost text-xs px-2 py-1" onClick={handleSummarize} disabled={loading || messages.length === 0}>
                  Generate
                </button>
              </div>
              {session?.checklist && session.checklist.length > 0 ? (
                <ul className="space-y-1.5">
                  {session.checklist.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#00274C]/70">
                      <input type="checkbox" className="mt-0.5 rounded" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#00274C]/25">
                  Chat with agents first, then generate a study checklist.
                </p>
              )}
            </div>

            {session?.summary && (
              <div className="bg-white/80 backdrop-blur-xl border border-[#00274C]/6 rounded-2xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-[#00274C] mb-2">Session Summary</h3>
                <p className="text-xs text-[#00274C]/50">{session.summary}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
