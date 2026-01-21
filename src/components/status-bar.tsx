"use client";

import { useMemo } from "react";

import { useAppStore } from "@/store/use-app-store";
import type { AppStatus } from "@/types/schema";

const pipeline: { code: AppStatus; label: string }[] = [
  { code: "IDLE", label: "就绪" },
  { code: "GENERATING_COPY", label: "文案" },
  { code: "GENERATING_IMAGE", label: "生图" },
  { code: "GENERATING_LAYOUT", label: "排版" },
  { code: "COMPLETED", label: "完成" },
];

const dotColors: Record<AppStatus, string> = {
  IDLE: "#2dd4bf", // teal
  GENERATING_COPY: "#f59e0b", // amber
  GENERATING_IMAGE: "#e879f9", // fuchsia
  GENERATING_LAYOUT: "#22d3ee", // cyan
  COMPLETED: "#10b981", // emerald
  FAILED: "#ef4444",
};

export function StatusBar() {
  const status = useAppStore((state) => state.status);

  const activeIndex = useMemo(
    () => pipeline.findIndex((step) => step.code === status),
    [status]
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-xs shadow-sm backdrop-blur">
      {pipeline.map((step, index) => {
        const isActive = index === activeIndex;
        const isCompleted = index < activeIndex;
        const color = dotColors[step.code];
        const dimmed = `${color}55`;
        return (
          <div
            key={step.code}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : isCompleted
                  ? "bg-muted text-muted-foreground"
                  : "bg-secondary text-secondary-foreground"
            }`}
          >
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{
                backgroundColor: isActive ? color : dimmed,
                boxShadow: isActive
                  ? `0 0 0 0 ${color}55`
                  : "0 0 0 0 rgba(0,0,0,0.12)",
                opacity: isActive ? 1 : 0.55,
                filter: isActive ? "none" : "grayscale(0.4)",
                animation: isActive ? "status-breathe 2s ease-in-out infinite" : "none",
              }}
            />
            <span className="font-medium">{step.label}</span>
          </div>
        );
      })}
      {status === "FAILED" && (
        <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
          失败
        </span>
      )}
      <style jsx global>{`
        @keyframes status-breathe {
          0%,
          100% {
            transform: scale(0.9);
            opacity: 0.45;
          }
          50% {
            transform: scale(1.35);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
