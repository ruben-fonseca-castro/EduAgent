"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export const PERSONA_VOICES: Record<string, { voiceId: string; name: string }> = {
  socratic_examiner: { voiceId: "onwK4e9ZLuTAKqWW03F9", name: "Alex" },   // Daniel — thoughtful British male
  friendly_tutor:    { voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Maya" },   // Sarah — warm female
  skeptic:           { voiceId: "N2lVS1w4EtoT3dr4eOWO", name: "Jordan" }, // Callum — edgy male
  practical_coach:   { voiceId: "XB0fDUnXU5powFXDhCwa", name: "Sam" },    // Charlotte — energetic female
  teacher_proxy:     { voiceId: "Xb7hH8MSUJpSbSDYk0k2", name: "Dr. Chen" }, // Alice — calm female
  mixed:             { voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "AI" },     // Lily — neutral
};

interface TTSState {
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  error: string | null;
}

export function useElevenLabsTTS() {
  // Audio element + Web Audio nodes created ONCE — never recreated
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const sourceCreated = useRef(false); // guard: createMediaElementSource only once
  const rafRef        = useRef<number>(0);
  const currentUrlRef = useRef<string>("");

  const [state, setState] = useState<TTSState>({
    isPlaying: false,
    isLoading: false,
    volume: 0,
    error: null,
  });

  // Initialise the audio graph once on mount
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;

    // Connect the audio element to the analyser — this can only be done ONCE
    const source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
    sourceCreated.current = true;

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.pause();
      try { ctx.close(); } catch {}
    };
  }, []);

  const stopCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      // Revoke old blob URL
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = "";
      }
    }
    cancelAnimationFrame(rafRef.current);
    setState((s) => ({ ...s, isPlaying: false, isLoading: false, volume: 0 }));
  }, []);

  const speak = useCallback(async (text: string, persona: string) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey || apiKey === "your_elevenlabs_api_key_here") {
      setState((s) => ({ ...s, error: "ElevenLabs API key not set in .env.local" }));
      return;
    }

    stopCurrent();
    setState((s) => ({ ...s, isLoading: true, error: null }));

    const voiceCfg = PERSONA_VOICES[persona] ?? PERSONA_VOICES.mixed;
    // Strip markdown syntax so TTS doesn't read symbols aloud
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/[_~]/g, "")
      .trim();

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceCfg.voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
          },
          body: JSON.stringify({
            text: cleanText,
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.80,
              style: 0.30,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 120)}`);
      }

      const buf  = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "audio/mpeg" });
      const url  = URL.createObjectURL(blob);
      currentUrlRef.current = url;

      const audio = audioRef.current!;
      const ctx   = audioCtxRef.current!;

      // Resume AudioContext if browser suspended it (autoplay policy)
      if (ctx.state === "suspended") await ctx.resume();

      // Just swap the src — the graph stays intact
      audio.src = url;

      // Volume polling
      const analyser   = analyserRef.current!;
      const dataArray  = new Uint8Array(analyser.frequencyBinCount);
      const poll = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setState((s) => ({ ...s, volume: avg / 255 }));
        rafRef.current = requestAnimationFrame(poll);
      };

      audio.onplay = () => {
        setState((s) => ({ ...s, isPlaying: true, isLoading: false }));
        poll();
      };

      audio.onended = () => {
        cancelAnimationFrame(rafRef.current);
        URL.revokeObjectURL(url);
        currentUrlRef.current = "";
        setState((s) => ({ ...s, isPlaying: false, volume: 0 }));
      };

      audio.onerror = () => {
        cancelAnimationFrame(rafRef.current);
        setState((s) => ({ ...s, isPlaying: false, isLoading: false, volume: 0 }));
      };

      await audio.play();
    } catch (err: any) {
      console.error("TTS error:", err);
      setState((s) => ({ ...s, isLoading: false, isPlaying: false, error: err.message ?? "TTS failed" }));
    }
  }, [stopCurrent]);

  return { speak, stop: stopCurrent, ...state };
}
