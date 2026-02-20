"use client";

import { useEffect, useRef } from "react";

interface LessonViewerProps {
  htmlContent: string;
  onReadyToTeach: () => void;
}

export function LessonViewer({ htmlContent, onReadyToTeach }: LessonViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Listen for "I'm Ready to Teach" button click from the lesson HTML
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "LESSON_COMPLETE") {
        onReadyToTeach();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onReadyToTeach]);

  useEffect(() => {
    if (!containerRef.current || !htmlContent) return;

    // Use a sandboxed iframe to render the lesson HTML
    const iframe = document.createElement("iframe");
    iframe.style.width = "100%";
    iframe.style.border = "none";
    iframe.style.borderRadius = "12px";
    iframe.style.minHeight = "600px";

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();

      // Auto-resize iframe to content height
      const resizeObserver = new ResizeObserver(() => {
        if (doc.body) {
          iframe.style.height = `${doc.body.scrollHeight + 32}px`;
        }
      });

      // Wait for content to load then observe
      setTimeout(() => {
        if (doc.body) {
          iframe.style.height = `${doc.body.scrollHeight + 32}px`;
          resizeObserver.observe(doc.body);
        }
      }, 500);

      return () => resizeObserver.disconnect();
    }
  }, [htmlContent]);

  return (
    <div className="w-full pb-16">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
