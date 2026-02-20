"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface ClassroomVoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function ClassroomVoiceInput({ onTranscript, disabled }: ClassroomVoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [supported, setSupported] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const isSecure = typeof window !== "undefined" && (
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    );

    const SpeechRecognition = typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    if (!isSecure) {
      setSupported(false);
      setVoiceError("Voice requires HTTPS. Use text input instead.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";

        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        if (final) {
          finalTranscriptRef.current = final;
          setTranscript(final);
        }

        setInterimText(interim);
      };

      recognition.onerror = (event: any) => {
        if (event.error === "network") {
          setSupported(false);
          setVoiceError("Voice unavailable (requires HTTPS). Use text input.");
          setIsListening(false);
          recognitionRef.current = null;
        } else if (event.error === "not-allowed") {
          setVoiceError("Microphone access denied. Check browser permissions.");
          setIsListening(false);
        } else if (event.error !== "no-speech" && event.error !== "aborted") {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        if (recognitionRef.current?._shouldListen) {
          try { recognition.start(); } catch {}
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
    } catch (e) {
      setSupported(false);
    }

    return () => {
      try { recognitionRef.current?.stop(); } catch {}
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || disabled) return;
    setVoiceError(null);
    finalTranscriptRef.current = "";
    setTranscript("");
    setInterimText("");
    try {
      recognitionRef.current._shouldListen = true;
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e) {
      setVoiceError("Could not start voice input. Try text instead.");
    }
  }, [disabled]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current._shouldListen = false;
    try { recognitionRef.current.stop(); } catch {}
    setIsListening(false);

    const fullText = (finalTranscriptRef.current + " " + interimText).trim();
    if (fullText) {
      onTranscript(fullText);
      setTranscript("");
      setInterimText("");
      finalTranscriptRef.current = "";
    }
  }, [interimText, onTranscript]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  const handleTextSubmit = () => {
    const text = transcript.trim();
    if (text) {
      onTranscript(text);
      setTranscript("");
      setInterimText("");
      finalTranscriptRef.current = "";
    }
  };

  const displayText = isListening
    ? (transcript + (interimText ? " " + interimText : "")).trim()
    : transcript;

  return (
    <div className="space-y-2 w-full">
      {/* Voice error */}
      {voiceError && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ {voiceError}
        </div>
      )}

      {/* Live transcript */}
      {isListening && displayText && (
        <div className="bg-[#00274C]/4 border border-[#00274C]/10 rounded-xl px-4 py-3">
          <p className="text-sm text-[#00274C]/70 leading-relaxed">
            {transcript && <span className="text-[#00274C]/90">{transcript}</span>}
            {interimText && <span className="text-[#00274C]/40 italic"> {interimText}</span>}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 w-full">
        {/* Mic button */}
        {supported && (
          <button
            onClick={toggleListening}
            disabled={disabled}
            title={isListening ? "Stop recording" : "Start voice input"}
            className={`
              flex items-center justify-center flex-shrink-0
              w-12 h-12 rounded-xl transition-all duration-300
              ${isListening
                ? "bg-[#D50032] shadow-lg shadow-[#D50032]/20 hover:bg-red-700"
                : "bg-[#00274C]/6 hover:bg-[#00274C]/10 border border-[#00274C]/12"
              }
              ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            {isListening ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00274C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            )}
          </button>
        )}

        {/* Text input */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={isListening ? displayText : transcript}
            onChange={(e) => { if (!isListening) setTranscript(e.target.value); }}
            onKeyDown={(e) => e.key === "Enter" && !isListening && handleTextSubmit()}
            placeholder={isListening ? "Listening..." : "Explain a concept to your AI students..."}
            readOnly={isListening}
            className={`
              w-full px-4 py-3 rounded-xl bg-white
              text-[#00274C] placeholder-[#00274C]/30 text-sm
              focus:outline-none transition-all duration-300
              ${disabled ? "opacity-40" : ""}
              ${isListening
                ? "border border-[#D50032]/20 bg-red-50/40"
                : "border border-[#00274C]/15 focus:border-[#00274C]/35 focus:shadow-[0_0_0_3px_rgba(0,39,76,0.06)]"
              }
            `}
            disabled={disabled}
          />
          {isListening && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-0.5 items-center">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="w-0.5 bg-[#D50032]/50 rounded-full animate-pulse"
                  style={{ height: "12px", animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={isListening ? stopListening : handleTextSubmit}
          disabled={disabled || (!isListening && !transcript.trim())}
          className={`
            flex items-center justify-center flex-shrink-0
            w-12 h-12 rounded-xl
            bg-gradient-to-br from-[#00274C] to-[#1B365D]
            hover:from-[#1B365D] hover:to-[#00274C]
            shadow-sm transition-all duration-300
            ${(disabled || (!isListening && !transcript.trim()))
              ? "opacity-25 cursor-not-allowed"
              : "cursor-pointer hover:scale-105 hover:shadow-md"
            }
          `}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
