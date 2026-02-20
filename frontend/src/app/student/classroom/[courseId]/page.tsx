"use client";

// Web Speech API type declarations (not in standard @types/lib)
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrEvent) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionResultEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionErrEvent extends Event {
  error: string;
}

import { useState, useEffect, useRef, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/lib/auth";
import { AIAvatar } from "@/components/classroom/AIAvatar";
import { TeachingScore } from "@/components/classroom/TeachingScore";
import { AudioWaveform } from "@/components/classroom/AudioWaveform";
import { useElevenLabsTTS, PERSONA_VOICES } from "@/hooks/useElevenLabsTTS";
import {
  classroom as classroomApi,
  courses as coursesApi,
  lessons as lessonsApi,
  type ClassroomSessionResponse,
  type ClassroomMessageResponse,
  type CourseResponse,
  type MaterialResponse,
  type PerformanceReportResponse,
} from "@/lib/api";
import { LessonProgress } from "@/components/classroom/LessonProgress";
import { LessonViewer } from "@/components/classroom/LessonViewer";
import { PerformanceReport } from "@/components/classroom/PerformanceReport";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Persona configuration ──────────────────────────────
const PERSONAS = [
  { key: "socratic_examiner", label: "Alex — Socratic Examiner", emoji: "🏛️", color: "#00274C", bgLight: "bg-[#00274C]/8", border: "border-[#00274C]/20" },
  { key: "friendly_tutor",    label: "Maya — Friendly Tutor",    emoji: "📚", color: "#C4960A", bgLight: "bg-amber-50",       border: "border-amber-200" },
  { key: "skeptic",           label: "Jordan — Skeptic",          emoji: "🔍", color: "#D50032", bgLight: "bg-red-50",         border: "border-red-200" },
  { key: "practical_coach",   label: "Sam — Practical Coach",     emoji: "🎯", color: "#059669", bgLight: "bg-emerald-50",     border: "border-emerald-200" },
  { key: "teacher_proxy",     label: "Dr. Chen — Teacher Proxy",  emoji: "👩‍🏫", color: "#7c3aed", bgLight: "bg-violet-50",     border: "border-violet-200" },
] as const;

// "mixed" is a synthetic persona returned by backend when blending 2+ personas
const MIXED_PERSONA_CFG = {
  key: "mixed" as const,
  label: "Class — Blended",
  emoji: "✦",
  color: "#475569",
  bgLight: "bg-slate-50",
  border: "border-slate-200",
};

type PersonaKey = typeof PERSONAS[number]["key"] | "mixed";

// ── Message bubble with markdown ────────────────────────
function AIResponseBubble({
  message,
  agentName,
  persona,
  isLoading,
  ttsPlaying,
  ttsLoading,
  volume,
  onSpeak,
  onStop,
}: {
  message: string;
  agentName: string;
  persona: PersonaKey | null;
  isLoading: boolean;
  ttsPlaying: boolean;
  ttsLoading: boolean;
  volume: number;
  onSpeak: () => void;
  onStop: () => void;
}) {
  const cfg = persona === "mixed"
    ? MIXED_PERSONA_CFG
    : persona
    ? PERSONAS.find((p) => p.key === persona) ?? null
    : null;
  const color = cfg?.color || "#00274C";
  const bgLight = cfg?.bgLight || "bg-white";
  const border = cfg?.border || "border-[#00274C]/10";

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="flex gap-2 items-end">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-1.5 rounded-full animate-pulse"
              style={{
                height: `${16 + Math.sin(i) * 10}px`,
                backgroundColor: color,
                opacity: 0.3 + i * 0.1,
                animationDelay: `${i * 120}ms`,
              }}
            />
          ))}
        </div>
        <p className="text-sm text-[#00274C]/30">Thinking...</p>
      </div>
    );
  }

  if (!message) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-[#00274C]/4 flex items-center justify-center text-2xl mb-4">
          {cfg?.emoji || "💬"}
        </div>
        <p className="text-lg font-medium text-[#00274C]/40">
          {persona ? `${agentName} is ready` : "Select a persona below"}
        </p>
        <p className="text-sm text-[#00274C]/25 mt-1">
          Type or speak to start the conversation
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Agent header with waveform */}
      <div className={`flex items-center gap-4 px-8 py-5 border-b ${border} ${bgLight} shrink-0`}>
        {persona === "mixed" ? (
          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-xl">
            ✦
          </div>
        ) : (
          <AIAvatar persona={persona || "socratic_examiner"} size="md" />
        )}
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color }}>{agentName}</p>
          <p className="text-xs text-[#00274C]/40">
            {persona === "mixed"
              ? "Blended perspectives"
              : cfg
              ? PERSONAS.find(p => p.key === persona)?.label.split("—")[1]?.trim() ?? ""
              : ""}
          </p>
        </div>

        {/* Waveform + TTS controls */}
        <div className="flex items-center gap-3">
          <AudioWaveform
            isPlaying={ttsPlaying}
            isLoading={ttsLoading}
            volume={volume}
            color={color}
            size="sm"
          />
          <button
            onClick={ttsPlaying ? onStop : onSpeak}
            className={`
              w-9 h-9 rounded-xl flex items-center justify-center transition-all
              ${ttsPlaying
                ? "bg-red-50 border border-red-200 text-[#D50032] hover:bg-red-100"
                : "bg-[#00274C]/6 border border-[#00274C]/12 text-[#00274C]/60 hover:bg-[#00274C]/10"
              }
            `}
            title={ttsPlaying ? "Stop speaking" : "Read aloud"}
          >
            {ttsLoading ? (
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : ttsPlaying ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Message content — full scrollable area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto text-[#00274C]/80 text-base leading-relaxed">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-[#00274C]">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              code: ({ children }) => (
                <code className="bg-[#00274C]/8 text-[#00274C] px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
              ),
              pre: ({ children }) => (
                <pre className="bg-[#00274C]/5 border border-[#00274C]/8 rounded-xl p-4 mt-2 mb-3 overflow-x-auto text-sm font-mono">{children}</pre>
              ),
              ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2 pl-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2 pl-1">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              h1: ({ children }) => <h1 className="font-bold text-[#00274C] text-lg mt-3 mb-1">{children}</h1>,
              h2: ({ children }) => <h2 className="font-bold text-[#00274C] text-base mt-2 mb-1">{children}</h2>,
              h3: ({ children }) => <h3 className="font-semibold text-[#00274C] mt-2 mb-0.5">{children}</h3>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-[#FFCB05] pl-4 italic text-[#00274C]/60 my-2">{children}</blockquote>
              ),
            }}
          >
            {message}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

// ── Persona multi-select dropdown ──────────────────────
function PersonaPicker({
  selected,
  onChange,
}: {
  selected: PersonaKey[];
  onChange: (keys: PersonaKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (key: PersonaKey) => {
    if (selected.includes(key)) {
      if (selected.length > 1) onChange(selected.filter((k) => k !== key));
    } else {
      if (selected.length < 3) onChange([...selected, key]);
    }
  };

  const primaryPersona = PERSONAS.find((p) => p.key === selected[0]);
  const label = selected.length === 1
    ? primaryPersona?.label || "Select persona"
    : `${primaryPersona?.emoji} + ${selected.length - 1} more`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#00274C]/15 hover:border-[#00274C]/30 transition-all text-sm text-[#00274C] font-medium shadow-sm"
      >
        <span className="text-base">{primaryPersona?.emoji}</span>
        <span className="max-w-[160px] truncate">{label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-72 bg-white border border-[#00274C]/10 rounded-2xl shadow-xl shadow-[#00274C]/10 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-[#00274C]/6">
            <p className="text-xs font-bold text-[#00274C]/40 uppercase tracking-wider">Choose AI Personas</p>
            <p className="text-[10px] text-[#00274C]/25 mt-0.5">1–3 personas • responses combined when multiple</p>
          </div>
          {PERSONAS.map((p) => {
            const isSelected = selected.includes(p.key);
            return (
              <button
                key={p.key}
                onClick={() => toggle(p.key)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 transition-all text-left
                  ${isSelected ? `${p.bgLight} ${p.border}` : "hover:bg-[#00274C]/2"}
                `}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 border ${p.border}`}
                  style={{ backgroundColor: `${p.color}15` }}
                >
                  {p.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#00274C]">{p.label.split("—")[0].trim()}</p>
                  <p className="text-[10px]" style={{ color: p.color }}>{p.label.split("—")[1]?.trim()}</p>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: p.color }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Mic input bars visualizer (canvas) ───────────────────
function MicBars({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const BAR_COUNT = 12;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(buf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barW = (canvas.width - (BAR_COUNT - 1) * 2) / BAR_COUNT;
      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = Math.floor((i / BAR_COUNT) * (buf.length * 0.5));
        const val = buf[idx] / 255;
        const h = Math.max(3, val * canvas.height);
        const x = i * (barW + 2);
        const y = (canvas.height - h) / 2;
        ctx.fillStyle = `rgba(213,0,50,${0.4 + val * 0.6})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, 2);
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser]);

  return <canvas ref={canvasRef} width={60} height={24} className="opacity-90" />;
}

// ── Text input — Web Speech API (live) + ElevenLabs fallback ──────────
// Primary: Web Speech API gives word-by-word output as you speak.
// Fallback: if WSA unavailable/errors, falls back to MediaRecorder → ElevenLabs STT
//           with a word-drip reveal after transcription.
// Live MicBars canvas shows mic level in both modes.
function TeachInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  // "live" = Web Speech API active (words appear as spoken)
  // "fallback" = MediaRecorder mode (words appear after stop)
  const [mode, setMode] = useState<"live" | "fallback">("live");
  const modeRef = useRef<"live" | "fallback">("live");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Web Speech API refs
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isRecordingRef = useRef(false); // mirror of isRecording for use in closures
  const interimBaseRef = useRef(""); // committed text before current interim result
  // MediaRecorder fallback refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- text helpers ---
  const handleSubmit = () => {
    const t = text.trim();
    if (!t) return;
    onSubmit(t);
    setText("");
    interimBaseRef.current = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  // --- word-drip reveal (fallback mode only) ---
  const dripWords = (transcript: string, base: string) => {
    const words = transcript.split(/\s+/).filter(Boolean);
    if (!words.length) { setIsTranscribing(false); return; }
    if (revealTimerRef.current) clearInterval(revealTimerRef.current);
    let i = 0;
    setIsTranscribing(true);
    revealTimerRef.current = setInterval(() => {
      i++;
      const chunk = words.slice(0, i).join(" ");
      setText(base ? base + " " + chunk : chunk);
      if (i >= words.length) {
        clearInterval(revealTimerRef.current!);
        revealTimerRef.current = null;
        setIsTranscribing(false);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    }, 65);
  };

  // --- ElevenLabs STT (fallback) ---
  const transcribeBlob = async (blob: Blob, baseText: string) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey || apiKey === "your_elevenlabs_api_key_here") {
      setSttError("ElevenLabs API key not set");
      return;
    }
    // Guard: don't send an empty or near-empty blob (< 1KB = no real audio)
    if (blob.size < 1000) {
      setSttError("No audio captured — speak for at least 1 second");
      return;
    }
    setIsTranscribing(true);
    setSttError(null);
    try {
      // Pick the right file extension based on the blob mime type
      const ext = blob.type.includes("mp4") ? "mp4"
                : blob.type.includes("ogg") ? "ogg"
                : "webm";
      const form = new FormData();
      form.append("file", blob, `audio.${ext}`);
      form.append("model_id", "scribe_v1");
      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("ElevenLabs STT error body:", body);
        // Parse detail if JSON
        let detail = `STT ${res.status}`;
        try { detail = JSON.parse(body)?.detail?.message || JSON.parse(body)?.detail || detail; } catch (_) {}
        throw new Error(detail);
      }
      const data = await res.json();
      const transcript: string = (data.text || "").trim();
      if (!transcript) { setSttError("No speech detected"); setIsTranscribing(false); return; }
      dripWords(transcript, baseText);
    } catch (err: any) {
      setSttError(err.message ?? "Transcription failed");
      setIsTranscribing(false);
    }
  };

  // --- start mic-level analyser (shared between modes) ---
  const startAnalyser = async (stream: MediaStream) => {
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      setMicAnalyser(analyser);
    } catch (_) { /* visualizer is optional */ }
  };

  const stopAnalyser = () => {
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setMicAnalyser(null);
  };

  // --- Web Speech API (live mode) ---
  const startLiveSTT = async () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Browser doesn't support WSA — fall back immediately
      return startFallbackRecording();
    }

    // Get mic stream for visualizer
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      await startAnalyser(stream);
    } catch (err: any) {
      setSttError(err.name === "NotAllowedError" ? "Microphone access denied" : "Could not access mic");
      return;
    }

    const recognition = new SpeechRecognition() as SpeechRecognitionInstance;
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // Snapshot of text before this recording session starts
    const sessionBase = text.trim();
    interimBaseRef.current = sessionBase;

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      let finalSoFar = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          finalSoFar += (finalSoFar ? " " : "") + r[0].transcript.trim();
        } else {
          interim += r[0].transcript;
        }
      }
      // Update interimBase whenever we get final results
      if (finalSoFar) {
        interimBaseRef.current = sessionBase
          ? sessionBase + " " + finalSoFar
          : finalSoFar;
      }
      // Show base + current interim live
      const display = interimBaseRef.current + (interim ? " " + interim : "");
      setText(display.trimStart());
    };

    recognition.onerror = (event: SpeechRecognitionErrEvent) => {
      const err = event.error;
      if (err === "no-speech") return; // ignore silence
      if (err === "network") {
        // WSA network error (common on HTTP) — silently switch to MediaRecorder fallback
        recognitionRef.current = null; // prevent onend restart loop
        modeRef.current = "fallback";
        setMode("fallback");
        setSttError(null);
        // The mic stream is already open — reuse it for MediaRecorder
        if (streamRef.current) {
          const capturedBase = text.trim();
          isRecordingRef.current = true;
          startFallbackFromStream(streamRef.current, capturedBase);
        }
        return;
      }
      setSttError(`Voice error: ${err}`);
      stopRecording();
    };

    recognition.onend = () => {
      // If we're still "recording" (user didn't click stop), restart to keep going
      if (recognitionRef.current === recognition && isRecordingRef.current) {
        try { recognition.start(); } catch (_) {}
      }
    };

    try {
      recognition.start();
      isRecordingRef.current = true;
      modeRef.current = "live";
      setIsRecording(true);
      setMode("live");
      setSttError(null);
    } catch (err: any) {
      setSttError("Could not start voice recognition");
      stopAnalyser();
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // --- MediaRecorder fallback ---
  const startFallbackFromStream = (stream: MediaStream, capturedBase: string) => {
    // Guard: don't start a second recorder if one is already running
    if (mediaRecorderRef.current?.state === "recording") return;
    audioChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      stopAnalyser();
      if (audioChunksRef.current.length > 0) {
        const blob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
        await transcribeBlob(blob, capturedBase);
      }
    };
    recorder.start(100);
  };

  const startFallbackRecording = async () => {
    setSttError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      await startAnalyser(stream);
      startFallbackFromStream(stream, text.trim());
      isRecordingRef.current = true;
      modeRef.current = "fallback";
      setIsRecording(true);
      setMode("fallback");
    } catch (err: any) {
      setSttError(err.name === "NotAllowedError" ? "Microphone access denied" : "Could not start recording");
    }
  };

  // --- unified start/stop ---
  const startRecording = () => {
    startLiveSTT();
  };

  const stopRecording = () => {
    // Stop Web Speech API
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent auto-restart
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    // Stop MediaRecorder
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    // If live mode, stop the mic stream + analyser now (fallback mode onstop handles it)
    if (modeRef.current === "live") {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      stopAnalyser();
    }
    isRecordingRef.current = false;
    setIsRecording(false);
  };

  // cleanup on unmount
  useEffect(() => () => {
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (_) {} }
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
    if (revealTimerRef.current) clearInterval(revealTimerRef.current);
  }, []);

  const busy = isTranscribing;
  const statusLabel = mode === "live"
    ? "Listening live — words appear as you speak"
    : "Recording... click ■ to stop & transcribe";

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-end gap-2 w-full">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { if (!busy && !isRecording) setText(e.target.value); }}
          onKeyDown={handleKeyDown}
          placeholder={
            isRecording && mode === "live" ? "🎙️ Speak now — words appear live..."
            : isRecording ? "🎙️ Recording... click ■ to stop & transcribe"
            : isTranscribing ? "✦ Transcribing your speech..."
            : "Explain a concept... (Enter to send, Shift+Enter for newline)"
          }
          readOnly={isRecording || busy}
          rows={1}
          className={`
            flex-1 resize-none px-4 py-3 rounded-xl bg-white
            border transition-all duration-200
            ${isRecording
              ? "border-[#D50032]/40 shadow-[0_0_0_3px_rgba(213,0,50,0.08)]"
              : isTranscribing
              ? "border-amber-300/60 shadow-[0_0_0_3px_rgba(251,191,36,0.08)]"
              : "border-[#00274C]/15 focus:border-[#00274C]/35 focus:shadow-[0_0_0_3px_rgba(0,39,76,0.06)]"
            }
            text-[#00274C] placeholder-[#00274C]/30 text-sm focus:outline-none
            ${(disabled || busy) ? "opacity-50 cursor-not-allowed" : ""}
          `}
          style={{ minHeight: "48px", maxHeight: "140px" }}
          disabled={disabled}
        />

        {/* Mic button */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled || isTranscribing}
          title={isRecording ? "Stop recording" : "Start voice input (live)"}
          className={`
            relative flex items-center justify-center w-12 h-12 rounded-xl
            border transition-all duration-200 flex-shrink-0 overflow-hidden
            ${isRecording
              ? "bg-[#D50032] border-[#D50032] text-white shadow-lg shadow-[#D50032]/30 scale-105"
              : isTranscribing
              ? "bg-amber-50 border-amber-200 text-amber-500"
              : "bg-white border-[#00274C]/15 text-[#00274C]/50 hover:border-[#00274C]/30 hover:text-[#00274C]/80 hover:bg-[#00274C]/3"
            }
            ${(disabled || isTranscribing) ? "opacity-60 cursor-not-allowed" : ""}
          `}
        >
          {isTranscribing ? (
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          ) : isRecording ? (
            <>
              <span className="absolute inset-0 rounded-xl bg-[#D50032]/15 animate-ping" />
              {micAnalyser
                ? <MicBars analyser={micAnalyser} />
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              }
            </>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>

        {/* Send */}
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim() || isTranscribing}
          className={`
            flex items-center justify-center w-12 h-12 rounded-xl
            bg-gradient-to-br from-[#00274C] to-[#1B365D]
            text-white shadow-sm transition-all duration-200 flex-shrink-0
            ${(disabled || !text.trim() || isTranscribing) ? "opacity-25 cursor-not-allowed" : "hover:scale-105 hover:shadow-md"}
          `}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

      {/* Status row */}
      {(sttError || isRecording || isTranscribing) && (
        <div className={`flex items-center gap-1.5 text-[10px] px-1 ${sttError ? "text-[#D50032]" : isTranscribing ? "text-amber-600" : "text-[#D50032]"}`}>
          {isRecording && <span className="w-1.5 h-1.5 rounded-full bg-[#D50032] animate-pulse inline-block" />}
          {sttError
            ? `⚠️ ${sttError}`
            : isRecording ? statusLabel
            : "✦ Transcribing your speech..."}
        </div>
      )}
    </div>
  );
}

// ── Main classroom page ─────────────────────────────────
export default function ClassroomPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();

  // ── Phase state machine ──
  type ClassroomPhase = "lesson_loading" | "lesson_generating" | "lesson_viewing" | "teaching" | "report";
  const [phase, setPhase] = useState<ClassroomPhase>("lesson_loading");
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lessonHtml, setLessonHtml] = useState<string | null>(null);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [performanceReport, setPerformanceReport] = useState<PerformanceReportResponse | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const [course, setCourse] = useState<CourseResponse | null>(null);
  const [materials, setMaterials] = useState<MaterialResponse[]>([]);
  const [session, setSession] = useState<ClassroomSessionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluateError, setEvaluateError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [teachingScore, setTeachingScore] = useState(0);
  const [topicsCovered, setTopicsCovered] = useState<string[]>([]);
  const [styleProfile, setStyleProfile] = useState<Record<string, number> | null>(null);
  const [supervisorFeedback, setSupervisorFeedback] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"progress" | "materials" | "history">("progress");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyBottomRef = useRef<HTMLDivElement>(null);

  // Current AI response
  const [currentMessage, setCurrentMessage] = useState("");
  const [currentPersona, setCurrentPersona] = useState<PersonaKey | null>(null);
  const [currentAgentName, setCurrentAgentName] = useState("");

  // Persona selection (multi-select, 1–3)
  const [selectedPersonas, setSelectedPersonas] = useState<PersonaKey[]>(["socratic_examiner"]);

  const [messageHistory, setMessageHistory] = useState<Array<{
    role: string;
    content: string;
    agent_name?: string;
    persona?: string;
  }>>([]);

  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const coinsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // TTS
  const tts = useElevenLabsTTS();

  useEffect(() => {
    if (authLoading) return;
    if (!token || !user) { router.push("/login"); return; }
    initSession();
  }, [authLoading, token, user, courseId]);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Auto-scroll history panel to bottom on new messages
  useEffect(() => {
    if (historyOpen && historyBottomRef.current) {
      historyBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messageHistory, historyOpen]);

  const initSession = async () => {
    if (!token) return;
    try {
      const [courseData, mats] = await Promise.all([
        coursesApi.get(token, courseId),
        coursesApi.listMaterials(token, courseId),
      ]);
      setCourse(courseData);
      const matList = mats.materials;
      setMaterials(matList);

      // Only generate/show a lesson if the course has ready materials
      const hasReadyMaterials = matList.some((m: MaterialResponse) => m.status === "ready");

      if (!hasReadyMaterials) {
        // No materials → go straight to teaching (nothing to generate a lecture from)
        setPhase("teaching");
        return;
      }

      // Check for existing lessons for this student + course
      const existingLessons = await lessonsApi.listForCourse(token, courseId);
      const readyLesson = existingLessons.find((l: any) => l.status === "ready");
      const generatingLesson = existingLessons.find((l: any) => l.status === "generating");

      if (readyLesson) {
        // Lesson already generated — fetch HTML and show it
        setLessonId(readyLesson.id);
        try {
          const content = await lessonsApi.getContent(token, readyLesson.id);
          if (content.html) {
            setLessonHtml(content.html);
            setPhase("lesson_viewing");
          } else {
            // HTML file missing on disk but lesson marked ready — regenerate
            const result = await lessonsApi.generate(token, { course_id: courseId });
            setLessonId(result.lesson_id);
            setPhase("lesson_generating");
          }
        } catch {
          // Content fetch failed — still show lesson viewer with error gracefully
          setPhase("teaching");
        }
      } else if (generatingLesson) {
        // Lesson still generating — reconnect to SSE progress stream
        setLessonId(generatingLesson.id);
        setPhase("lesson_generating");
      } else {
        // No lesson yet — kick off generation now
        const result = await lessonsApi.generate(token, { course_id: courseId });
        setLessonId(result.lesson_id);
        setPhase("lesson_generating");
      }
    } catch (e: any) {
      console.error("initSession error:", e);
      // Backend unreachable — show error, not silent skip
      setLessonError(e?.message ?? "Could not connect to server. Is the backend running?");
      setPhase("teaching"); // still allow teaching page (will show its own connection error)
    } finally {
      setInitialLoading(false);
    }
  };

  // Initialize teaching session when entering teaching phase
  const initTeachingSession = async () => {
    if (!token) return;
    try {
      const sess = await classroomApi.createSession(token, {
        course_id: courseId,
        lesson_id: lessonId || undefined,
      });
      setSession(sess);
      setMessageHistory(sess.messages || []);
      setTeachingScore(sess.teaching_score);
      setTopicsCovered(sess.topics_covered || []);
      setStyleProfile(sess.style_profile);

      const msgs = sess.messages || [];
      const lastAssistant = [...msgs].reverse().find((m: any) => m.role === "assistant");

      if (lastAssistant) {
        // Resuming a previous session — show last AI message
        setCurrentMessage(lastAssistant.content);
        setCurrentPersona((lastAssistant.persona as PersonaKey) || null);
        setCurrentAgentName(lastAssistant.agent_name || "");
      } else {
        // Fresh session — generate an opening question from the lesson topic
        try {
          const opening = await classroomApi.getOpeningQuestion(token, sess.id);
          setCurrentMessage(opening.question);
          setCurrentPersona((opening.persona as PersonaKey) || "socratic_examiner");
          setCurrentAgentName(opening.agent_name || "Alex");
        } catch {
          // Fallback static prompt if API fails
          const topicName = course?.title || "this topic";
          setCurrentMessage(
            `Hey! I just finished reading the lesson on "${topicName}" and I'm ready to learn from you. ` +
            `Could you walk me through the most important concept? Teach me like I've never heard of it before!`
          );
          setCurrentPersona("socratic_examiner");
          setCurrentAgentName("Alex");
        }
      }
    } catch (e: any) {
      console.error("initTeachingSession error:", e);
      setEvaluateError(e?.message ?? "Could not start session. Is the backend running?");
    }
  };

  // When phase transitions to teaching, create the session
  useEffect(() => {
    if (phase === "teaching" && !session && token) {
      initTeachingSession();
    }
  }, [phase, session, token]);

  const handleLessonComplete = useCallback(async () => {
    if (!token || !lessonId) return;
    try {
      const content = await lessonsApi.getContent(token, lessonId);
      if (content.html) {
        setLessonHtml(content.html);
        setPhase("lesson_viewing");
      } else {
        setPhase("teaching");
      }
    } catch {
      setPhase("teaching");
    }
  }, [token, lessonId]);

  const handleReadyToTeach = useCallback(() => {
    setPhase("teaching");
  }, []);

  const handleGenerateReport = async () => {
    if (!token || !session || generatingReport) return;
    setGeneratingReport(true);
    try {
      const report = await classroomApi.generateReport(token, session.id);
      setPerformanceReport(report);
      setPhase("report");
    } catch (e: any) {
      console.error("Report generation failed:", e);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleBackToTeaching = useCallback(() => {
    setPerformanceReport(null);
    setPhase("teaching");
  }, []);

  const handleTeach = useCallback(async (text: string) => {
    if (!token || !session) return;
    setLoading(true);
    tts.stop();
    setCurrentMessage("");

    setMessageHistory((prev) => [...prev, { role: "user", content: text }]);

    try {
      const response: ClassroomMessageResponse = await classroomApi.sendMessage(token, {
        session_id: session.id,
        text,
        personas: selectedPersonas as string[],
      });

      setTeachingScore(response.teaching_score);
      setTopicsCovered(response.topics_covered);
      setSupervisorFeedback(response.supervisor_feedback);

      if (response.coins_earned && response.coins_earned > 0) {
        setCoinsEarned(response.coins_earned);
        if (coinsTimeoutRef.current) clearTimeout(coinsTimeoutRef.current);
        coinsTimeoutRef.current = setTimeout(() => setCoinsEarned(null), 4000);
      }

      // Backend always returns exactly 1 response (blended if multiple personas were selected)
      const responses = response.agent_responses;
      if (responses.length === 0) return;

      const primary = responses[0];
      const displayMessage = primary.message;
      const displayPersona = primary.persona as PersonaKey;
      const displayName = primary.agent_name;

      setCurrentMessage(displayMessage);
      setCurrentPersona(displayPersona);
      setCurrentAgentName(displayName);

      setMessageHistory((prev) => [...prev, {
        role: "assistant",
        content: displayMessage,
        agent_name: displayName,
        persona: primary.persona,
      }]);

      // Auto-play TTS — use "mixed" voice for blended responses, persona voice for single
      const ttsPersona = primary.persona === "mixed" ? "mixed" : displayPersona;
      await tts.speak(displayMessage, ttsPersona);

    } catch (e) {
      console.error(e);
      setCurrentMessage("Something went wrong. Please try again.");
      setCurrentPersona("socratic_examiner");
      setCurrentAgentName("System");
    } finally {
      setLoading(false);
    }
  }, [token, session, selectedPersonas, tts]);

  const handleEvaluate = async () => {
    if (evaluating) return;
    if (!token || !session) {
      setEvaluateError("Session not ready — try sending a message first");
      return;
    }
    setEvaluating(true);
    setEvaluateError(null);
    try {
      const eval_ = await classroomApi.evaluate(token, session.id);
      setTeachingScore(eval_.teaching_score);
      setStyleProfile(eval_.style_profile);
      setSupervisorFeedback(eval_.summary);
      // Switch sidebar to progress tab so user sees the results
      setSidebarTab("progress");
      setSidebarOpen(true);
    } catch (e: any) {
      console.error("Evaluate error:", e);
      setEvaluateError(e?.message ?? "Evaluation failed — check console");
    } finally {
      setEvaluating(false);
    }
  };

  const handleDownloadMaterial = async (mat: MaterialResponse) => {
    if (!token) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/courses/${courseId}/materials/${mat.id}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Open in new tab for PDFs, download for others
      if (mat.file_type === "pdf") {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = mat.filename;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      console.error(e);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#00274C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#00274C]/40 text-sm">Entering classroom...</p>
        </div>
      </div>
    );
  }

  // ── Lesson phase renders ──────────────────────────────
  if (phase === "lesson_loading") {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#00274C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#00274C]/40 text-sm">Preparing your lesson...</p>
        </div>
      </div>
    );
  }

  if (phase === "lesson_generating" && lessonId && token) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex flex-col">
        <header className="shrink-0 bg-white border-b border-[#00274C]/8 px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/student/classroom" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </Link>
            <div className="w-px h-5 bg-[#00274C]/8" />
            <span className="text-sm font-semibold text-[#00274C]">{course?.title || "Classroom"}</span>
          </div>
          <button
            onClick={() => setPhase("teaching")}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#00274C]/5 border border-[#00274C]/10 text-[#00274C]/50 hover:bg-[#00274C]/10 transition-all"
          >
            Skip to Teaching →
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          {lessonError ? (
            <div className="max-w-md text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#D50032]/10 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D50032" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h3 className="text-base font-semibold text-[#00274C]">Lesson generation failed</h3>
              <p className="text-sm text-[#00274C]/40">{lessonError}</p>
              <button
                onClick={() => setPhase("teaching")}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium text-sm transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #D50032, #00274C)" }}
              >
                Continue to Teaching →
              </button>
            </div>
          ) : (
            <LessonProgress
              lessonId={lessonId}
              token={token}
              onComplete={handleLessonComplete}
              onError={(msg) => setLessonError(msg)}
            />
          )}
        </div>
      </div>
    );
  }

  if (phase === "lesson_viewing" && lessonHtml) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex flex-col">
        <header className="shrink-0 bg-white border-b border-[#00274C]/8 px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/student/classroom" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </Link>
            <div className="w-px h-5 bg-[#00274C]/8" />
            <span className="text-sm font-semibold text-[#00274C]">{course?.title || "Lesson"}</span>
          </div>
          <button
            onClick={handleReadyToTeach}
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #D50032, #00274C)" }}
          >
            Skip to Teaching &rarr;
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <LessonViewer htmlContent={lessonHtml} onReadyToTeach={handleReadyToTeach} />
        </div>
      </div>
    );
  }

  if (phase === "report" && performanceReport) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex flex-col">
        <header className="shrink-0 bg-white border-b border-[#00274C]/8 px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/student/classroom" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </Link>
            <div className="w-px h-5 bg-[#00274C]/8" />
            <span className="text-sm font-semibold text-[#00274C]">Performance Report</span>
          </div>
          <Link
            href="/student/classroom"
            className="text-xs px-4 py-2 rounded-xl bg-[#00274C]/5 border border-[#00274C]/10 text-[#00274C]/60 hover:bg-[#00274C]/10 transition-all font-medium"
          >
            Back to Courses
          </Link>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-lg mx-auto">
            <h1 className="text-2xl font-bold text-[#00274C] mb-6 text-center">Your Performance Report</h1>
            <PerformanceReport
              report={performanceReport}
              onBackToTeaching={handleBackToTeaching}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Teaching phase (existing UI) ──────────────────────
  return (
    <div className="bg-[#FAFBFD] text-[#00274C] flex flex-col" style={{ height: "100vh", overflow: "hidden" }}>
      {/* Coins notification */}
      {coinsEarned !== null && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-bounce pointer-events-none">
          <div className="bg-gradient-to-r from-[#FFCB05] to-[#FFD84D] text-[#00274C] px-6 py-3 rounded-2xl shadow-lg flex items-center gap-2 font-bold text-sm">
            🪙 +{coinsEarned.toFixed(1)} coins earned!
          </div>
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 bg-white border-b border-[#00274C]/8 z-20">
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/student/classroom" className="text-[#00274C]/40 hover:text-[#00274C]/70 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </Link>
            <div className="w-px h-5 bg-[#00274C]/8" />
            <span className="text-sm font-semibold text-[#00274C] truncate max-w-[200px]">
              {course?.title || "Classroom"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Score */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#00274C]/4 border border-[#00274C]/8">
              <div className={`w-2 h-2 rounded-full ${teachingScore >= 80 ? "bg-emerald-500" : teachingScore >= 50 ? "bg-amber-400" : "bg-red-400"}`} />
              <span className="text-xs font-bold tabular-nums">{Math.round(teachingScore)}</span>
              <span className="text-[10px] text-[#00274C]/40">score</span>
            </div>
            <span className="text-[#00274C]/30 text-xs font-mono hidden sm:block">{formatTime(elapsed)}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleEvaluate}
                disabled={evaluating || messageHistory.filter(m => m.role === "user").length === 0}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl bg-[#FFCB05]/15 border border-[#FFCB05]/40 hover:bg-[#FFCB05]/25 text-[#00274C] font-medium transition-all disabled:opacity-20"
              >
                {evaluating && (
                  <div className="w-3 h-3 border border-[#00274C]/40 border-t-transparent rounded-full animate-spin" />
                )}
                {evaluating ? "Evaluating..." : "Evaluate"}
              </button>
              <button
                onClick={handleGenerateReport}
                disabled={generatingReport || messageHistory.filter(m => m.role === "user").length === 0}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl bg-gradient-to-r from-[#D50032]/10 to-[#00274C]/10 border border-[#D50032]/20 hover:from-[#D50032]/20 hover:to-[#00274C]/20 text-[#00274C] font-medium transition-all disabled:opacity-20"
              >
                {generatingReport && (
                  <div className="w-3 h-3 border border-[#00274C]/40 border-t-transparent rounded-full animate-spin" />
                )}
                {generatingReport ? "Generating..." : "Report"}
              </button>
            </div>
            {evaluateError && (
              <span className="text-[9px] text-[#D50032] max-w-[180px] text-right leading-tight">{evaluateError}</span>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-[#00274C]/30 hover:text-[#00274C]/60 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center stage — full width AI response */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* AI Response Area — takes all available vertical space */}
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            <AIResponseBubble
              message={currentMessage}
              agentName={currentAgentName}
              persona={currentPersona}
              isLoading={loading}
              ttsPlaying={tts.isPlaying}
              ttsLoading={tts.isLoading}
              volume={tts.volume}
              onSpeak={() => currentMessage && currentPersona && tts.speak(currentMessage, selectedPersonas.length > 1 ? "mixed" : currentPersona)}
              onStop={tts.stop}
            />
          </div>

          {/* Collapsible conversation history panel */}
          <div className="shrink-0 border-t border-[#00274C]/6 bg-[#FAFBFD]">
            {/* Toggle bar — always visible */}
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 sm:px-6 py-2 hover:bg-[#00274C]/2 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#00274C]/35 uppercase tracking-wider">
                  Conversation History
                </span>
                {messageHistory.length > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#00274C]/8 text-[#00274C]/40 font-medium">
                    {messageHistory.length}
                  </span>
                )}
              </div>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                className={`text-[#00274C]/30 group-hover:text-[#00274C]/60 transition-all duration-200 ${historyOpen ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Expandable message list */}
            {historyOpen && (
              <div className="max-h-[260px] overflow-y-auto border-t border-[#00274C]/4 px-4 sm:px-6 py-3">
                {messageHistory.length === 0 ? (
                  <p className="text-[11px] text-[#00274C]/25 text-center py-4">No messages yet</p>
                ) : (
                  <div className="max-w-3xl mx-auto flex flex-col gap-2">
                    {messageHistory.map((msg, i) => {
                      const personaCfg = msg.persona === "mixed"
                        ? MIXED_PERSONA_CFG
                        : msg.persona ? PERSONAS.find(p => p.key === msg.persona) : null;
                      const isUser = msg.role === "user";
                      return (
                        <div key={i} className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                          {isUser ? (
                            <div className="max-w-[80%] bg-[#FFCB05]/10 border border-[#FFCB05]/25 rounded-xl rounded-br-sm px-3 py-2">
                              <p className="text-[11px] text-[#00274C]/70 leading-relaxed">{msg.content}</p>
                            </div>
                          ) : (
                            <div className="max-w-[80%] flex gap-2 items-start">
                              <div
                                className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px] shrink-0 mt-0.5 border"
                                style={{ backgroundColor: `${personaCfg?.color || "#00274C"}15`, borderColor: `${personaCfg?.color || "#00274C"}30` }}
                              >
                                {personaCfg?.emoji || "AI"}
                              </div>
                              <div className="bg-white border border-[#00274C]/8 rounded-xl rounded-bl-sm px-3 py-2">
                                <p className="text-[9px] font-bold mb-0.5" style={{ color: personaCfg?.color || "#00274C" }}>
                                  {msg.agent_name || "AI"}
                                </p>
                                <p className="text-[11px] text-[#00274C]/60 leading-relaxed">{msg.content}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={historyBottomRef} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="shrink-0 border-t border-[#00274C]/6 bg-white px-4 sm:px-6 py-4">
            <div className="max-w-3xl mx-auto space-y-3">
              {/* Persona picker row */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-[#00274C]/35 uppercase tracking-wider font-semibold shrink-0">Talking to</span>
                <PersonaPicker selected={selectedPersonas} onChange={setSelectedPersonas} />
                {loading && (
                  <div className="ml-auto flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {[0,1,2].map(i => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#00274C]/25 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
                      ))}
                    </div>
                    <span className="text-[10px] text-[#00274C]/30">AI thinking...</span>
                  </div>
                )}
              </div>

              {/* Text input */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00274C] to-[#1B365D] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {user?.display_name?.charAt(0).toUpperCase() || "S"}
                </div>
                <div className="flex-1">
                  <TeachInput onSubmit={handleTeach} disabled={loading} />
                </div>
              </div>

              {tts.error && (
                <p className="text-[10px] text-amber-600">⚠️ {tts.error}</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className={`
          w-72 border-l border-[#00274C]/6 flex flex-col shrink-0 bg-[#FAFBFD]
          transition-all duration-300
          ${sidebarOpen ? "w-72 opacity-100" : "w-0 opacity-0 overflow-hidden"}
        `}>
          {sidebarOpen && (
            <>
              <div className="flex border-b border-[#00274C]/6 bg-white shrink-0">
                {(["progress", "materials", "history"] as const).map((tab) => (
                  <button key={tab} onClick={() => setSidebarTab(tab)}
                    className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-all ${
                      sidebarTab === tab
                        ? "text-[#00274C] border-b-2 border-[#FFCB05] bg-[#FFCB05]/5"
                        : "text-[#00274C]/30 hover:text-[#00274C]/50"
                    }`}>
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {sidebarTab === "progress" && (
                  <>
                    <div className="bg-white border border-[#00274C]/6 rounded-xl p-4 shadow-sm">
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#00274C]/40 mb-3">Teaching Score</h3>
                      <TeachingScore score={teachingScore} styleProfile={styleProfile} />
                    </div>
                    {topicsCovered.length > 0 && (
                      <div className="bg-white border border-[#00274C]/6 rounded-xl p-4 shadow-sm">
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#00274C]/40 mb-3">Topics Covered</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {topicsCovered.map((t, i) => (
                            <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {supervisorFeedback && (
                      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600/60 mb-2">Teacher Proxy</p>
                        <p className="text-xs text-[#00274C]/60 leading-relaxed italic">{supervisorFeedback}</p>
                      </div>
                    )}
                  </>
                )}

                {sidebarTab === "materials" && (
                  <div className="space-y-2">
                    {materials.length === 0 ? (
                      <p className="text-xs text-[#00274C]/30 text-center py-8">No materials uploaded yet</p>
                    ) : (
                      materials.map((mat) => (
                        <div key={mat.id} className="bg-white border border-[#00274C]/6 rounded-xl p-3 shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${
                              mat.file_type === "pdf" ? "bg-red-50" : "bg-[#00274C]/4"
                            }`}>
                              {mat.file_type === "pdf" ? "📄" : mat.file_type === "image" ? "🖼️" : "📝"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-[#00274C]/70 truncate font-medium">{mat.filename}</p>
                              <p className={`text-[10px] ${mat.status === "ready" ? "text-emerald-600" : mat.status === "processing" ? "text-amber-500" : "text-red-500"}`}>
                                {mat.status === "ready" ? "✓ Ready" : mat.status === "processing" ? "Processing..." : "Error"}
                              </p>
                            </div>
                          </div>
                          {mat.status === "ready" && (
                            <button
                              onClick={() => handleDownloadMaterial(mat)}
                              className="mt-2 w-full flex items-center justify-center gap-1.5 text-[10px] text-[#00274C]/50 hover:text-[#00274C] py-1.5 rounded-lg hover:bg-[#00274C]/4 transition-all border border-[#00274C]/8 hover:border-[#00274C]/20"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              {mat.file_type === "pdf" ? "Open PDF" : "Download"}
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {sidebarTab === "history" && (
                  <div className="space-y-2">
                    {messageHistory.length === 0 ? (
                      <p className="text-xs text-[#00274C]/30 text-center py-8">No messages yet</p>
                    ) : (
                      messageHistory.slice(-40).map((msg, i) => (
                        <div key={i} className={`text-xs p-3 rounded-xl ${
                          msg.role === "user"
                            ? "bg-[#FFCB05]/8 border border-[#FFCB05]/20"
                            : "bg-white border border-[#00274C]/6"
                        }`}>
                          <span className={`text-[10px] font-bold block mb-1 ${
                            msg.role === "user" ? "text-[#00274C]" :
                            msg.persona === "friendly_tutor" ? "text-amber-600" :
                            msg.persona === "skeptic" ? "text-[#D50032]" :
                            msg.persona === "practical_coach" ? "text-emerald-600" :
                            msg.persona === "teacher_proxy" ? "text-violet-600" :
                            "text-[#00274C]"
                          }`}>
                            {msg.role === "user" ? "You" : msg.agent_name || "AI"}
                          </span>
                          <p className="line-clamp-3 text-[#00274C]/55 leading-relaxed">{msg.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
