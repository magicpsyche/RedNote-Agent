"use client";

import { useMemo } from "react";

import { useAppStore } from "@/store/use-app-store";
import type { AppStatus } from "@/types/schema";

const pipeline: { code: AppStatus; label: string }[] = [
  { code: "IDLE", label: "就绪" },
  { code: "GENERATING_COPY", label: "文案" },
  { code: "GENERATING_STRATEGY", label: "视觉策略" },
  { code: "GENERATING_IMAGE", label: "生图" },
  { code: "GENERATING_LAYOUT", label: "排版" },
  { code: "COMPLETED", label: "完成" },
];

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
            <span className="h-2 w-2 rounded-full bg-current opacity-80" />
            <span className="font-medium">{step.label}</span>
          </div>
        );
      })}
      {status === "FAILED" && (
        <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
          失败
        </span>
      )}
    </div>
  );
}
