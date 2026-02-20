"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onTranscript, disabled }: VoiceRecorderProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check HTTPS requirement
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

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript(finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "network") {
          setSupported(false);
          setVoiceError("Voice unavailable (requires HTTPS). Use text input.");
          setIsListening(false);
          recognitionRef.current = null;
        } else if (event.error === "not-allowed") {
          setVoiceError("Microphone access denied. Check browser permissions.");
          setIsListening(false);
        } else {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.error("Failed to initialize speech recognition:", e);
      setSupported(false);
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setVoiceError(null);

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      if (transcript.trim()) {
        onTranscript(transcript.trim());
        setTranscript("");
      }
    } else {
      setTranscript("");
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        setVoiceError("Could not start voice input. Try text instead.");
      }
    }
  }, [isListening, transcript, onTranscript]);

  const handleTextSubmit = () => {
    if (transcript.trim()) {
      onTranscript(transcript.trim());
      setTranscript("");
    }
  };

  return (
    <div className="space-y-2">
      {voiceError && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ {voiceError}
        </div>
      )}
      <div className="flex gap-2 items-center">
        {supported && (
          <Button
            onClick={toggleListening}
            disabled={disabled}
            variant={isListening ? "destructive" : "default"}
            size="sm"
            className="flex items-center gap-2"
          >
            {isListening ? (
              <>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                Stop
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
                Speak
              </>
            )}
          </Button>
        )}
        <input
          type="text"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
          placeholder={isListening ? "Listening..." : "Type your question..."}
          className="flex-1 px-3 py-2 border border-[#00274C]/10 rounded-lg text-sm bg-white focus:outline-none focus:border-[#00274C]/30 focus:ring-2 focus:ring-[#00274C]/5"
          disabled={disabled || isListening}
        />
        <Button onClick={handleTextSubmit} disabled={disabled || !transcript.trim() || isListening} size="sm">
          Send
        </Button>
      </div>
      {isListening && transcript && (
        <p className="text-sm text-[#00274C]/50 italic">&ldquo;{transcript}&rdquo;</p>
      )}
    </div>
  );
}
