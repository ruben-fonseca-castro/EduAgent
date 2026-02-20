"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

// ── Types ───────────────────────────────────────────────────────────────────

export interface TutorialStep {
  /** CSS selector or data-tutorial="<id>" to highlight */
  target: string;
  /** Title shown in the popup */
  title: string;
  /** Description / body text */
  body: string;
  /** Preferred placement relative to target */
  placement?: "top" | "bottom" | "left" | "right";
  /** If set, navigate to this path before showing the step */
  navigateTo?: string;
  /** Delay (ms) after navigation before showing step */
  navDelay?: number;
}

interface TutorialOverlayProps {
  steps: TutorialStep[];
  storageKey: string;
  onComplete?: () => void;
  /** If true, always show (ignore localStorage) */
  forceShow?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function findTarget(target: string): HTMLElement | null {
  // Try direct CSS selector first
  let el = document.querySelector<HTMLElement>(target);
  if (el) return el;
  // Try data-tutorial attribute
  el = document.querySelector<HTMLElement>(`[data-tutorial="${target}"]`);
  return el;
}

function getPlacement(
  targetRect: DOMRect,
  popupW: number,
  popupH: number,
  preferred: TutorialStep["placement"] = "bottom"
): { top: number; left: number; arrowSide: string } {
  const gap = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = targetRect.left + targetRect.width / 2;
  const cy = targetRect.top + targetRect.height / 2;

  // Try preferred, then fallback
  const attempts: Array<TutorialStep["placement"]> = [preferred, "bottom", "top", "right", "left"];

  for (const side of attempts) {
    let top = 0, left = 0, arrowSide = "";
    switch (side) {
      case "bottom":
        top = targetRect.bottom + gap;
        left = cx - popupW / 2;
        arrowSide = "top";
        break;
      case "top":
        top = targetRect.top - popupH - gap;
        left = cx - popupW / 2;
        arrowSide = "bottom";
        break;
      case "right":
        top = cy - popupH / 2;
        left = targetRect.right + gap;
        arrowSide = "left";
        break;
      case "left":
        top = cy - popupH / 2;
        left = targetRect.left - popupW - gap;
        arrowSide = "right";
        break;
    }
    // Clamp to viewport
    left = Math.max(12, Math.min(left, vw - popupW - 12));
    top = Math.max(12, Math.min(top, vh - popupH - 12));

    // Check if it fits
    if (top >= 0 && top + popupH <= vh && left >= 0 && left + popupW <= vw) {
      return { top, left, arrowSide };
    }
  }

  // Fallback: center bottom
  return {
    top: Math.min(targetRect.bottom + gap, vh - popupH - 12),
    left: Math.max(12, cx - popupW / 2),
    arrowSide: "top",
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function TutorialOverlay({
  steps,
  storageKey,
  onComplete,
  forceShow = false,
}: TutorialOverlayProps) {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, arrowSide: "top" });
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const POPUP_W = 340;
  const POPUP_H_EST = 200;

  // Check if tutorial was already completed
  useEffect(() => {
    if (forceShow) {
      setVisible(true);
      return;
    }
    const done = localStorage.getItem(storageKey);
    if (!done) {
      // Small delay so the page renders first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [storageKey, forceShow]);

  // Position the popup relative to current target
  const positionPopup = useCallback(() => {
    if (!visible || current >= steps.length) return;
    const step = steps[current];
    const el = findTarget(step.target);
    if (!el) {
      // Target not found — skip to next or position center
      setTargetRect(null);
      setPos({
        top: window.innerHeight / 2 - POPUP_H_EST / 2,
        left: window.innerWidth / 2 - POPUP_W / 2,
        arrowSide: "none",
      });
      return;
    }

    const rect = el.getBoundingClientRect();
    setTargetRect(rect);

    // Scroll into view if needed
    if (rect.top < 80 || rect.bottom > window.innerHeight - 20) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        const newRect = el.getBoundingClientRect();
        setTargetRect(newRect);
        const popupH = popupRef.current?.offsetHeight || POPUP_H_EST;
        setPos(getPlacement(newRect, POPUP_W, popupH, step.placement));
      }, 400);
      return;
    }

    const popupH = popupRef.current?.offsetHeight || POPUP_H_EST;
    setPos(getPlacement(rect, POPUP_W, popupH, step.placement));
  }, [visible, current, steps]);

  useEffect(() => {
    positionPopup();
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    return () => {
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
    };
  }, [positionPopup]);

  // Re-position after render (popup height may change)
  useEffect(() => {
    const t = setTimeout(positionPopup, 50);
    return () => clearTimeout(t);
  }, [current, positionPopup]);

  const finish = useCallback(() => {
    setVisible(false);
    localStorage.setItem(storageKey, "done");
    onComplete?.();
  }, [storageKey, onComplete]);

  const next = () => {
    if (current + 1 >= steps.length) {
      finish();
    } else {
      setCurrent((c) => c + 1);
    }
  };

  const prev = () => {
    if (current > 0) setCurrent((c) => c - 1);
  };

  if (!visible || steps.length === 0) return null;

  const step = steps[current];
  const isFirst = current === 0;
  const isLast = current === steps.length - 1;

  // Spotlight cutout dimensions (with padding)
  const pad = 8;
  const spot = targetRect
    ? {
        x: targetRect.left - pad,
        y: targetRect.top - pad,
        w: targetRect.width + pad * 2,
        h: targetRect.height + pad * 2,
        rx: 12,
      }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: "auto" }}>
      {/* Dark backdrop with spotlight cutout */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <mask id="tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            {spot && (
              <rect
                x={spot.x}
                y={spot.y}
                width={spot.w}
                height={spot.h}
                rx={spot.rx}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,20,40,0.55)"
          mask="url(#tutorial-mask)"
        />
      </svg>

      {/* Spotlight ring glow */}
      {spot && (
        <div
          className="absolute rounded-xl ring-2 ring-[#FFCB05] ring-offset-2 ring-offset-transparent transition-all duration-300"
          style={{
            left: spot.x,
            top: spot.y,
            width: spot.w,
            height: spot.h,
            pointerEvents: "none",
            boxShadow: "0 0 0 4px rgba(255,203,5,0.2), 0 0 30px rgba(255,203,5,0.15)",
          }}
        />
      )}

      {/* Dismiss click layer (clicking backdrop advances or closes) */}
      <div
        className="absolute inset-0"
        onClick={(e) => {
          // Don't dismiss if clicking inside popup or spotlight
          if (popupRef.current?.contains(e.target as Node)) return;
          // Allow clicks through to the spotlight target
        }}
        style={{ pointerEvents: "auto" }}
      />

      {/* Popup card */}
      <div
        ref={popupRef}
        className="absolute bg-white rounded-2xl shadow-2xl border border-gray-200/80 overflow-hidden transition-all duration-300 ease-out"
        style={{
          top: pos.top,
          left: pos.left,
          width: POPUP_W,
          zIndex: 10000,
          pointerEvents: "auto",
          animation: "tutorialFadeIn 0.25s ease-out",
        }}
      >
        {/* Header bar */}
        <div className="px-4 py-3 bg-gradient-to-r from-[#00274C] to-[#1B365D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <span className="text-xs text-white/60 font-medium">
              Step {current + 1} of {steps.length}
            </span>
          </div>
          <button
            onClick={finish}
            className="text-white/40 hover:text-white/80 transition-colors text-xs font-medium"
          >
            Skip Tour
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <h3 className="text-base font-bold text-[#00274C] mb-1.5">{step.title}</h3>
          <p className="text-sm text-[#00274C]/60 leading-relaxed">{step.body}</p>
        </div>

        {/* Footer with navigation */}
        <div className="px-5 py-3 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
          {/* Step dots */}
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === current
                    ? "bg-[#FFCB05] w-4"
                    : i < current
                    ? "bg-[#00274C]/30"
                    : "bg-[#00274C]/10"
                }`}
              />
            ))}
          </div>
          {/* Buttons */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={prev}
                className="text-xs text-[#00274C]/50 hover:text-[#00274C] font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all"
              >
                Prev
              </button>
            )}
            <button
              onClick={next}
              className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#FFCB05] to-[#FFD54F] text-[#00274C] hover:shadow-md transition-all"
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe animation (injected once) */}
      <style>{`
        @keyframes tutorialFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}
