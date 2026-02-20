"use client";

import { useEffect, useRef } from "react";

interface AudioWaveformProps {
  isPlaying: boolean;
  isLoading: boolean;
  volume: number; // 0-1
  color?: string;
  size?: "sm" | "md" | "lg";
}

export function AudioWaveform({
  isPlaying,
  isLoading,
  volume,
  color = "#00274C",
  size = "lg",
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const currentVolumeRef = useRef(0);
  const targetVolumeRef = useRef(0);

  const dims = {
    sm: { w: 120, h: 40, bars: 20 },
    md: { w: 200, h: 60, bars: 32 },
    lg: { w: 320, h: 80, bars: 48 },
  }[size];

  useEffect(() => {
    targetVolumeRef.current = isPlaying ? Math.max(0.08, volume) : (isLoading ? 0.04 : 0);
  }, [volume, isPlaying, isLoading]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h, bars } = dims;
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const barW = 3;
    const gap = (w - bars * barW) / (bars + 1);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Smooth volume interpolation
      const target = targetVolumeRef.current;
      currentVolumeRef.current += (target - currentVolumeRef.current) * 0.12;
      const vol = currentVolumeRef.current;

      phaseRef.current += isPlaying ? 0.08 : 0.02;
      const phase = phaseRef.current;

      const centerY = h / 2;

      for (let i = 0; i < bars; i++) {
        const x = gap + i * (barW + gap);
        const normalizedPos = (i / bars) * Math.PI * 2;

        // Layered sine waves for organic feel
        const wave1 = Math.sin(normalizedPos * 2 + phase) * 0.5;
        const wave2 = Math.sin(normalizedPos * 3 - phase * 1.3) * 0.3;
        const wave3 = Math.sin(normalizedPos * 5 + phase * 0.7) * 0.2;
        const combined = (wave1 + wave2 + wave3) * vol;

        // Bar height: min 2px baseline, max = h/2 * volume amplitude
        const maxBarH = (h / 2) * 0.9;
        const barH = Math.max(1.5, Math.abs(combined) * maxBarH + (isLoading ? 3 : vol > 0.01 ? 2 : 1.5));

        // Alpha based on position — center bars are brightest
        const distFromCenter = Math.abs(i - bars / 2) / (bars / 2);
        const alpha = isPlaying ? 0.9 - distFromCenter * 0.3 : 0.25;

        // Gradient per bar
        const gradient = ctx.createLinearGradient(x, centerY - barH, x, centerY + barH);
        gradient.addColorStop(0, `${color}00`);
        gradient.addColorStop(0.3, `${color}${Math.round(alpha * 200).toString(16).padStart(2, "0")}`);
        gradient.addColorStop(0.5, `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`);
        gradient.addColorStop(0.7, `${color}${Math.round(alpha * 200).toString(16).padStart(2, "0")}`);
        gradient.addColorStop(1, `${color}00`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, centerY - barH, barW, barH * 2, 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, isLoading, color, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: dims.w, height: dims.h }}
      className="block"
    />
  );
}
