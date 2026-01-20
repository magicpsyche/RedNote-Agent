"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Draggable from "react-draggable";
import { toPng } from "html-to-image";

import { StatusBar } from "@/components/status-bar";
import { useAppStore } from "@/store/use-app-store";
import type { AppStatus, CopyResult, LayoutConfig, TextLayer } from "@/types/schema";

const PLACEHOLDER_BG = "https://placehold.co/2304x3072/png?text=Awaiting%20cover";
const glowColors: Record<AppStatus, string> = {
  IDLE: "#2dd4bf",
  GENERATING_COPY: "#f59e0b",
  GENERATING_STRATEGY: "#6366f1",
  GENERATING_IMAGE: "#e879f9",
  GENERATING_LAYOUT: "#22d3ee",
  COMPLETED: "#10b981",
  FAILED: "#ef4444",
};
const generatingStatuses: AppStatus[] = [
  "GENERATING_COPY",
  "GENERATING_STRATEGY",
  "GENERATING_IMAGE",
  "GENERATING_LAYOUT",
];

export function Workspace() {
  const { copyResult, status } = useAppStore();

  const tags = useMemo(() => copyResult?.tags ?? [], [copyResult?.tags]);
  const isGenerating = generatingStatuses.includes(status as AppStatus);
  const glowColor = glowColors[status as AppStatus] ?? "#22d3ee";

  return (
    <section
      className="relative isolate"
      style={
        {
          "--glow-color": glowColor,
          "--workspace-radius": "20px",
        } as CSSProperties
      }
    >
      {isGenerating && (
        <div
          aria-hidden
          className="workspace-glow-border pointer-events-none absolute -inset-[4px] z-30"
          style={{ borderRadius: "var(--workspace-radius, 20px)" }}
        />
      )}
      <div
        className="relative z-20 border border-border/80 bg-card/70 p-5 shadow-sm backdrop-blur"
        style={{ borderRadius: "var(--workspace-radius, 20px)" }}
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold leading-tight">工作区</h2>
          </div>
          <div className="flex justify-end">
            <StatusBar />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr,1.2fr]">
          <CopyPanel copyPresent={Boolean(copyResult)} tags={tags} />
          <CanvasPreview />
        </div>
        {status === "FAILED" && (
          <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            生成失败：请检查输入或稍后重试。如需占位预览，可再次提交或使用模拟按钮。
          </div>
        )}
      </div>
      <style jsx global>{`
        @keyframes workspace-glow-breathe {
          0%,
          100% {
            opacity: 0.65;
          }
          50% {
            opacity: 0.95;
          }
        }
        @keyframes workspace-border-orbit {
          from {
            --orbit-angle: 0deg;
          }
          to {
            --orbit-angle: 360deg;
          }
        }
        .workspace-glow-border {
          pointer-events: none;
          padding: 2px;
          border-radius: calc(var(--workspace-radius, 20px) + 6px);
          background: conic-gradient(
            from var(--orbit-angle, 0deg),
            color-mix(in srgb, var(--glow-color, #22d3ee) 88%, transparent) 0deg,
            color-mix(in srgb, var(--glow-color, #22d3ee) 32%, transparent) 120deg,
            color-mix(in srgb, var(--glow-color, #22d3ee) 18%, transparent) 200deg,
            color-mix(in srgb, var(--glow-color, #22d3ee) 88%, transparent) 320deg,
            color-mix(in srgb, var(--glow-color, #22d3ee) 58%, transparent) 360deg
          );
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          -webkit-mask-composite: destination-out;
          animation:
            workspace-border-orbit 5s linear infinite,
            workspace-glow-breathe 2.4s ease-in-out infinite;
          box-shadow: 0 0 35px color-mix(in srgb, var(--glow-color, #22d3ee) 40%, transparent);
          mix-blend-mode: normal;
          isolation: isolate;
        }
      `}</style>
    </section>
  );
}

function normalizeLayer(layer: Layer): Layer {
  const style = normalizeStyle(layer.style);
  return { ...layer, style };
}

function normalizeStyle(style: TextLayer["style"]): TextLayer["style"] {
  const next: Record<string, unknown> = { ...style };
  if (typeof style.position === "object" && style.position) {
    const pos = style.position as Record<string, string>;
    if (pos.top) next.top = pos.top;
    if (pos.left) next.left = pos.left;
    if (pos.right) next.right = pos.right;
    if (pos.bottom) next.bottom = pos.bottom;
    delete next.position;
  }
  if (!next.position) next.position = "absolute";
  return next as TextLayer["style"];
}

function CopyPanel({ copyPresent, tags }: { copyPresent: boolean; tags: string[] }) {
  const { copyResult, setCopyResult } = useAppStore();
  const placeholderTags = useMemo(
    () => (tags.length ? tags : ["#话题标签", "#小红书风格", "#等待生成"]),
    [tags]
  );
  const [copied, setCopied] = useState(false);
  const [titleDraft, setTitleDraft] = useState(copyResult?.title ?? "");
  const [contentDraft, setContentDraft] = useState(copyResult?.content ?? "");
  const [tagDrafts, setTagDrafts] = useState<string[]>(copyResult?.tags ?? placeholderTags);
  const [newTagValue, setNewTagValue] = useState("");
  const copyResetRef = useRef<number>();

  useEffect(() => {
    setTitleDraft(copyResult?.title ?? "");
    setContentDraft(copyResult?.content ?? "");
    setTagDrafts(copyResult?.tags ?? placeholderTags);
  }, [copyResult?.content, copyResult?.tags, copyResult?.title, placeholderTags]);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) {
        clearTimeout(copyResetRef.current);
      }
    };
  }, []);

  const persistCopyResult = (partial: Partial<CopyResult>) => {
    const base: CopyResult = {
      product_id: copyResult?.product_id ?? "manual-draft",
      tone: copyResult?.tone ?? "",
      title: copyResult?.title ?? titleDraft ?? "",
      content: copyResult?.content ?? contentDraft ?? "",
      tags: copyResult?.tags ?? tagDrafts ?? [],
      selling_keywords: copyResult?.selling_keywords ?? [],
    };
    setCopyResult({ ...base, ...partial });
  };

  const handleCopy = async () => {
    const text = (contentDraft || copyResult?.content || "").trim();
    if (!text) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      console.error("Copy failed", error);
    }
  };

  const handleTagChange = (index: number, value: string) => {
    const updated = [...tagDrafts];
    updated[index] = value;
    setTagDrafts(updated);
    persistCopyResult({ tags: updated });
  };

  const handleRemoveTag = (index: number) => {
    const updated = tagDrafts.filter((_, idx) => idx !== index);
    setTagDrafts(updated);
    persistCopyResult({ tags: updated });
  };

  const handleAddTag = () => {
    const value = newTagValue.trim();
    if (!value) return;
    const updated = [...tagDrafts, value];
    setTagDrafts(updated);
    persistCopyResult({ tags: updated });
    setNewTagValue("");
  };

  const canCopy = Boolean((contentDraft || copyResult?.content || "").trim());

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4 shadow-inner">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">文案编辑器</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-3 py-1 text-[11px] text-secondary-foreground">
            {copyResult?.product_id ?? "未生成"}
          </span>
          <button
            type="button"
            disabled={!canCopy}
            onClick={() => void handleCopy()}
            className={`group relative overflow-hidden rounded-full border border-border px-3 py-1 text-xs font-semibold transition-all duration-200 ${
              copied
                ? "bg-gradient-to-r from-emerald-500/80 to-teal-500/70 text-white shadow-[0_8px_30px_rgba(16,185,129,0.25)]"
                : "text-foreground hover:bg-muted/60"
            } disabled:opacity-50`}
          >
            <span
              className={`absolute inset-0 scale-150 bg-white/20 blur-2xl transition-opacity duration-300 ${
                copied ? "opacity-80" : "opacity-0"
              }`}
              aria-hidden
            />
            <span
              className={`relative flex items-center gap-1 ${copied ? "animate-[pulse_0.9s_ease-out]" : ""}`}
            >
              <span className="h-2 w-2 rounded-full bg-current opacity-80 transition-transform duration-200 group-hover:scale-110" />
              {copied ? "已复制" : "复制正文"}
            </span>
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        <div className="space-y-3 rounded-lg border border-border/60 bg-card/80 p-3">
          <input
            className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm font-semibold shadow-inner outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            placeholder="输入/修改文案标题"
            value={titleDraft}
            onChange={(e) => {
              const nextTitle = e.target.value;
              setTitleDraft(nextTitle);
              persistCopyResult({ title: nextTitle });
            }}
          />
          <textarea
            rows={20}
            className="w-full resize-none rounded-md border border-border/60 bg-background px-3 py-2 text-sm leading-6 text-muted-foreground shadow-inner outline-none focus:border-primary focus:text-foreground focus:ring-2 focus:ring-primary/30"
            placeholder={copyPresent ? "微调生成的正文..." : "等待生成或手动输入文案..."}
            value={contentDraft}
            onChange={(e) => {
              const nextContent = e.target.value;
              setContentDraft(nextContent);
              persistCopyResult({ content: nextContent });
            }}
          />
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tagDrafts.map((tag, index) => (
              <div
                key={`${tag}-${index}`}
                className="group flex w-full items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 shadow-sm"
              >
                <input
                  className="w-full bg-transparent text-xs font-medium text-foreground outline-none placeholder:text-muted-foreground"
                  value={tag}
                  onChange={(e) => handleTagChange(index, e.target.value)}
                  placeholder="#添加标签"
                />
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleRemoveTag(index)}
                  aria-label="删除标签"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex w-full items-center gap-2 rounded-full border border-dashed border-border px-3 py-1">
              <input
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="#新增标签"
                value={newTagValue}
                onChange={(e) => setNewTagValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <button
                type="button"
                className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-primary hover:underline"
                onClick={handleAddTag}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CanvasPreview() {
  const {
    layoutConfig,
    visualStrategy,
    backgroundImagePreview,
    setLayoutConfig,
    copyResult,
  } = useAppStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const previewShellRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const dragRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);

  const bgUrl = layoutConfig?.canvas?.backgroundImage ?? backgroundImagePreview ?? PLACEHOLDER_BG;
  const overlayOpacity = layoutConfig?.canvas?.overlayOpacity ?? 0;
  const logicalWidth = layoutConfig?.canvas?.width ?? 1080;
  const logicalHeight = layoutConfig?.canvas?.height ?? 1440;

  const layers = useMemo(() => layoutConfig?.layers ?? [], [layoutConfig]);
  const normalizedLayers = useMemo(
    () => layers.map((layer) => normalizeLayer(layer)),
    [layers]
  );

  const handleTextUpdate = (id: string, content: string) => {
    if (!layoutConfig) return;
    const updated: LayoutConfig = {
      ...layoutConfig,
      layers: layoutConfig.layers.map((layer) =>
        layer.id === id && layer.type === "text"
          ? { ...layer, content }
          : layer
      ),
    };
    setLayoutConfig(updated);
  };

  const handleDrag = (
    id: string,
    data: { x: number; y: number },
    node?: HTMLDivElement | null
  ) => {
    if (!layoutConfig || !logicalWidth || !logicalHeight) return;
    const scale = canvasScale || 1;
    const rect = node?.getBoundingClientRect();
    const layerWidth = rect ? rect.width / scale : 0;
    const layerHeight = rect ? rect.height / scale : 0;
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);

    const maxX = logicalWidth - layerWidth > 0 ? logicalWidth - layerWidth : logicalWidth;
    const maxY = logicalHeight - layerHeight > 0 ? logicalHeight - layerHeight : logicalHeight;
    const clampedX = clamp(data.x, 0, maxX);
    const clampedY = clamp(data.y, 0, maxY);

    const topPercent = (clampedY / logicalHeight) * 100;
    const leftPercent = (clampedX / logicalWidth) * 100;

    const updated: LayoutConfig = {
      ...layoutConfig,
      layers: layoutConfig.layers.map((layer) => {
        if (layer.id !== id) return layer;
        const style = {
          ...layer.style,
          top: `${topPercent}%`,
          left: `${leftPercent}%`,
        };
        return { ...layer, style };
      }),
    };
    setLayoutConfig(updated);
  };

  const layerPositions = useMemo(() => {
    if (!logicalWidth || !logicalHeight) return {};
    return Object.fromEntries(
      layers.map((layer) => {
        const style = normalizeStyle(layer.style);
        const hasLeft = style.left !== undefined && style.left !== null;
        const hasTop = style.top !== undefined && style.top !== null;
        const hasRight = style.right !== undefined && style.right !== null;
        const hasBottom = style.bottom !== undefined && style.bottom !== null;

        const leftRaw = parseFloat(String(style.left ?? "0"));
        const topRaw = parseFloat(String(style.top ?? "0"));
        const rightRaw = parseFloat(String(style.right ?? "0"));
        const bottomRaw = parseFloat(String(style.bottom ?? "0"));

        const topIsPercent = typeof style.top === "string" && String(style.top).includes("%");
        const leftIsPercent = typeof style.left === "string" && String(style.left).includes("%");
        const rightIsPercent = typeof style.right === "string" && String(style.right).includes("%");
        const bottomIsPercent = typeof style.bottom === "string" && String(style.bottom).includes("%");

        const x = hasLeft
          ? leftIsPercent
            ? (leftRaw / 100) * logicalWidth
            : leftRaw
          : hasRight
            ? rightIsPercent
              ? logicalWidth - (rightRaw / 100) * logicalWidth
              : logicalWidth - rightRaw
            : 0;

        const y = hasTop
          ? topIsPercent
            ? (topRaw / 100) * logicalHeight
            : topRaw
          : hasBottom
            ? bottomIsPercent
              ? logicalHeight - (bottomRaw / 100) * logicalHeight
              : logicalHeight - bottomRaw
            : 0;
        return [layer.id, { x, y }];
      })
    );
  }, [layers, logicalWidth, logicalHeight]);

  const adjustZIndex = (id: string, delta: number) => {
    if (!layoutConfig) return;
    const updated: LayoutConfig = {
      ...layoutConfig,
      layers: layoutConfig.layers.map((layer) =>
        layer.id === id
          ? {
              ...layer,
              style: {
                ...layer.style,
                zIndex:
                  (typeof (layer.style as { zIndex?: number }).zIndex === "number"
                    ? (layer.style as { zIndex?: number }).zIndex
                    : 1) + delta,
              },
            }
          : layer
      ),
    };
    setLayoutConfig(updated);
  };

  const exportImage = async () => {
    if (!exportRef.current || !layoutConfig) return;
    setIsExporting(true);

    const cleanup: Array<() => void> = [];
    const node = exportRef.current;
    const exportWidth = logicalWidth || 1080;
    const exportHeight = logicalHeight || 1440;

    try {
      node.style.width = `${exportWidth}px`;
      node.style.height = `${exportHeight}px`;
      node.style.transform = "scale(1)";
      node.style.transformOrigin = "top left";

      const restoreBg = await inlineBackground(node, bgUrl);
      if (restoreBg) cleanup.push(restoreBg);

      if (document.fonts?.ready) {
        await document.fonts.ready.catch(() => undefined);
      }

      const dataUrl = await toPng(node, {
        width: exportWidth,
        height: exportHeight,
        pixelRatio: 1,
        cacheBust: true,
        // 避免 html-to-image 内联跨域字体报错（codicon / vscode 样式表）
        skipFonts: true,
        backgroundColor: "#ffffff",
        style: {
          width: `${exportWidth}px`,
          height: `${exportHeight}px`,
        },
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = copyResult?.product_id ? `${copyResult.product_id}_cover.png` : "cover.png";
      link.click();
    } catch (error) {
      console.error("Export failed", error);
    } finally {
      cleanup.forEach((fn) => fn());
      setIsExporting(false);
    }
  };

  const inlineBackground = async (node: HTMLDivElement, imageUrl: string) => {
    if (!imageUrl || imageUrl.startsWith("data:")) return null;
    try {
      const res = await fetch(imageUrl, { mode: "cors" });
      if (!res.ok) throw new Error(`bg fetch failed: ${res.status}`);
      const blob = await res.blob();
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error("Failed to load background image"));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const prev = node.style.backgroundImage;
      node.style.backgroundImage = `url(${dataUrl})`;

      return () => {
        node.style.backgroundImage = prev;
      };
    } catch (error) {
      console.warn("背景图内联失败，继续导出（可能缺少底图）", error);
      return null;
    }
  };

  const previewRatio = logicalWidth && logicalHeight ? logicalWidth / logicalHeight : 3 / 4;
  const canvasScale = useMemo(() => {
    if (!canvasSize.width || !canvasSize.height) return 1;
    if (!logicalWidth || !logicalHeight) return 1;
    const scale = Math.min(canvasSize.width / logicalWidth, canvasSize.height / logicalHeight);
    return Math.min(scale || 1, 1);
  }, [canvasSize.height, canvasSize.width, logicalHeight, logicalWidth]);

  const pickBoxStyle = useMemo(
    () => (style: TextLayer["style"]) => {
      const keys: Array<keyof CSSProperties> = [
        "width",
        "minWidth",
        "maxWidth",
        "height",
        "minHeight",
        "maxHeight",
        "transform",
        "transformOrigin",
      ];
      const entries = Object.entries(style as Record<string, unknown>).filter(([key]) =>
        keys.includes(key as keyof CSSProperties)
      );
      return Object.fromEntries(entries) as CSSProperties;
    },
    []
  );
  const previewScale = useMemo(() => {
    if (!previewSize.width || !previewSize.height) return 1;
    if (!logicalWidth || !logicalHeight) return 1;
    const scale = Math.min(previewSize.width / logicalWidth, previewSize.height / logicalHeight);
    return Math.min(scale || 1, 1);
  }, [logicalHeight, logicalWidth, previewSize.height, previewSize.width]);

  const previewImages = useMemo(() => {
    const images = [bgUrl].filter(Boolean);
    if (images.length < 2) images.push("https://placehold.co/2304x3072/png?text=Slide+2");
    if (images.length < 3) images.push("https://placehold.co/2304x3072/png?text=Slide+3");
    return images;
  }, [bgUrl]);

  useEffect(() => {
    if (activeSlide > previewImages.length - 1) {
      setActiveSlide(0);
    }
  }, [activeSlide, previewImages.length]);

  useEffect(() => {
    if (!canvasShellRef.current) return;
    const updateSize = () => {
      const rect = canvasShellRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCanvasSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvasShellRef.current);
    return () => observer.disconnect();
  }, [logicalWidth, logicalHeight]);

  useEffect(() => {
    if (!previewShellRef.current) return;
    const updatePreviewSize = () => {
      const rect = previewShellRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPreviewSize({ width: rect.width, height: rect.height });
    };
    updatePreviewSize();
    const observer = new ResizeObserver(updatePreviewSize);
    observer.observe(previewShellRef.current);
    return () => observer.disconnect();
  }, [isPreviewOpen, logicalWidth, logicalHeight]);

  const getNodeRef = (id: string) => {
    if (!dragRefs.current[id]) {
      dragRefs.current[id] = { current: null };
    }
    return dragRefs.current[id];
  };

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4 shadow-inner">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Canvas 编辑器</p>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="rounded-full border border-border px-3 py-1 font-semibold hover:bg-muted/60"
          >
            预览
          </button>
          <button
            type="button"
            onClick={exportImage}
            disabled={isExporting}
            className="rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground shadow hover:shadow-md disabled:opacity-60"
          >
            {isExporting ? "导出中…" : "导出"}
          </button>
        </div>
      </div>

      <div className="relative isolate w-full overflow-hidden rounded-xl border border-border bg-gradient-to-b from-muted/40 to-background shadow-md">
        <div
          ref={canvasShellRef}
          className="relative mx-auto"
          style={{ aspectRatio: `${logicalWidth} / ${logicalHeight}`, width: "100%" }}
        >
          <div className="absolute inset-0">
            <div
              ref={canvasRef}
              className="relative"
              style={{
                width: `${logicalWidth}px`,
                height: `${logicalHeight}px`,
                transform: `scale(${canvasScale})`,
                transformOrigin: "top left",
                backgroundImage: `url(${bgUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {overlayOpacity > 0 && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.6)",
                    opacity: overlayOpacity,
                  }}
                />
              )}
              <div className="absolute inset-0">
                {normalizedLayers.map((layer) =>
                  layer.type === "text" ? (
                    (() => {
                      const nodeRef = getNodeRef(layer.id);
                      const position =
                        layerPositions[layer.id] ?? {
                          x: parseFloat(String(layer.style.left ?? "0")) || 0,
                          y: parseFloat(String(layer.style.top ?? "0")) || 0,
                        };
                      const boxStyle = pickBoxStyle(layer.style);
                      return (
                        <Draggable
                          key={`${layer.id}-${logicalWidth}-${logicalHeight}`}
                          nodeRef={nodeRef}
                          position={position}
                          scale={canvasScale || 1}
                          onDrag={(_, data) => handleDrag(layer.id, data, nodeRef.current)}
                          onStop={(_, data) => handleDrag(layer.id, data, nodeRef.current)}
                        >
                          <div
                            ref={nodeRef}
                            style={{
                              position: "absolute",
                              zIndex: (layer.style as { zIndex?: number }).zIndex ?? 1,
                              ...boxStyle,
                            }}
                          >
                            <TextLayerNode
                              layer={layer}
                              onChange={handleTextUpdate}
                              onZIndexChange={adjustZIndex}
                              canvasScale={canvasScale}
                              omitPosition
                            />
                          </div>
                        </Draggable>
                      );
                    })()
                  ) : (
                    <div
                      key={layer.id}
                      className="absolute"
                      style={{
                        ...layer.style,
                      }}
                    >
                      {layer.content}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none"
        style={{ position: "fixed", left: "-9999px", top: "-9999px" }}
      >
        <div
          ref={exportRef}
          className="relative"
          style={{
            width: `${logicalWidth}px`,
            height: `${logicalHeight}px`,
          }}
        >
          {bgUrl && (
            <>
              {/* 导出使用的隐藏底图节点，需保留原生 img 供 html-to-image 读取 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bgUrl}
                alt=""
                crossOrigin="anonymous"
                loading="eager"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </>
          )}
          {overlayOpacity > 0 && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundColor: "rgba(0,0,0,0.6)",
                opacity: overlayOpacity,
              }}
            />
          )}
          <div className="absolute inset-0">
            {normalizedLayers.map((layer) =>
              layer.type === "text" ? (
                <TextLayerNode key={`export-${layer.id}`} layer={layer} readOnly />
              ) : (
                <div
                  key={`export-${layer.id}`}
                  className="absolute"
                  style={{
                    ...layer.style,
                  }}
                >
                  {layer.content}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {isPreviewOpen && (
        <div className="fixed inset-0 z-40 bg-[#07060b]/90 backdrop-blur">
          <button
            className="absolute right-5 top-5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur hover:bg-white/20"
            onClick={() => setPreviewOpen(false)}
          >
            关闭预览
          </button>
          <div className="flex min-h-screen items-center justify-center px-4 py-10">
            <div className="relative w-full max-w-[420px]">
              <div className="relative rounded-[42px] bg-black p-3 shadow-[0_28px_90px_rgba(0,0,0,0.55)] ring-1 ring-white/15">
                <div className="absolute inset-[10px] rounded-[34px] border border-white/8 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.04),transparent_36%)]" />
                <div className="relative overflow-hidden rounded-[34px] bg-gradient-to-b from-[#0c0b0f] via-[#0b0b0d] to-[#050506]">
                  <div
                    className="mx-auto w-full rounded-[30px] border border-white/10 bg-white text-slate-900 shadow-[0_22px_70px_rgba(0,0,0,0.32)]"
                    style={{ fontFamily: "'DM Sans', 'SF Pro Display', 'Helvetica Neue', sans-serif" }}
                  >
                    <div className="overflow-hidden rounded-[26px]">
                      <div className="flex items-center justify-between px-6 py-3 text-[11px] font-semibold tracking-tight text-slate-800">
                        <span>09:41</span>
                        <div className="flex items-center gap-1 text-[10px] font-bold">
                          <span className="h-2 w-2 rounded-full bg-slate-900" />
                          <span className="h-2 w-2 rounded-full bg-slate-900" />
                          <span className="h-2.5 w-5 rounded-md bg-slate-900" />
                        </div>
                      </div>
                      <div className="border-t border-slate-100 bg-white/98">
                        <header className="flex items-center gap-3 px-5 pt-4 pb-[10px]">
                          <button className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-sm">
                            ←
                          </button>
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#ff2e63] via-[#ffb88c] to-[#ffdcdc] shadow ring-2 ring-white" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">
                              {copyResult?.product_id || "RedNote Studio"}
                            </p>
                            <p className="text-[11px] text-slate-500">小红书 · 合成预览</p>
                          </div>
                          <button className="rounded-full bg-[#ff2e63] px-4 py-2 text-[12px] font-semibold text-white shadow hover:shadow-md">
                            关注
                          </button>
                          <button
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-slate-300"
                            aria-label="分享"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              className="h-5 w-5"
                            >
                              <path d="M8.75 12c0-1.794 0-2.69.556-3.245C9.861 8.2 10.758 8.2 12.55 8.2h.15a.1.1 0 0 0 .1-.1V5.75a.75.75 0 0 1 1.22-.567l5.75 4.55a.75.75 0 0 1 0 1.174l-5.75 4.55a.75.75 0 0 1-1.22-.567V13.9a.1.1 0 0 0-.1-.1h-.15c-1.792 0-2.69 0-3.244-.555C8.75 12.69 8.75 11.794 8.75 10z" />
                              <path
                                d="M5.5 6.75a1.25 1.25 0 0 0-1.25 1.25v8a1.25 1.25 0 0 0 1.25 1.25H10"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </header>
                        <div className="p-0">
                          <div className="relative overflow-hidden bg-black" style={{ aspectRatio: previewRatio }}>
                            <div
                              ref={previewShellRef}
                              className="absolute inset-0"
                              onTouchStart={(e) => {
                                touchStartX.current = e.touches[0].clientX;
                                touchDeltaX.current = 0;
                              }}
                              onTouchMove={(e) => {
                                touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
                              }}
                              onTouchEnd={() => {
                                if (touchDeltaX.current > 40) {
                                  setActiveSlide((prev) =>
                                    prev - 1 < 0 ? previewImages.length - 1 : prev - 1
                                  );
                                } else if (touchDeltaX.current < -40) {
                                  setActiveSlide((prev) => (prev + 1) % previewImages.length);
                                }
                                touchDeltaX.current = 0;
                                touchStartX.current = 0;
                              }}
                            >
                              <div
                                className="flex h-full w-full transition-transform duration-500 ease-out"
                                style={{ transform: `translateX(-${activeSlide * 100}%)` }}
                              >
                                {previewImages.map((image, index) => (
                                  <div key={index} className="relative h-full w-full shrink-0">
                                    <div
                                      className="absolute inset-0"
                                      style={{
                                        width: `${logicalWidth}px`,
                                        height: `${logicalHeight}px`,
                                        transform: `scale(${previewScale})`,
                                        transformOrigin: "top left",
                                        backgroundImage: `url(${image})`,
                                        backgroundSize: "cover",
                                        backgroundPosition: "center",
                                      }}
                                    >
                                      {overlayOpacity > 0 && (
                                        <div
                                          className="absolute inset-0 pointer-events-none"
                                          style={{
                                            backgroundColor: "rgba(0,0,0,0.6)",
                                            opacity: overlayOpacity,
                                          }}
                                        />
                                      )}
                                      <div className="absolute inset-0">
                                        {normalizedLayers.map((layer) =>
                                          layer.type === "text" ? (
                                            <TextLayerNode key={layer.id} layer={layer} readOnly />
                                          ) : (
                                            <div
                                              key={layer.id}
                                              className="absolute"
                                              style={{
                                                ...layer.style,
                                              }}
                                            >
                                              {layer.content}
                                            </div>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <button
                              type="button"
                              aria-label="上一张"
                              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/35 px-2 py-2 text-white shadow hover:bg-black/55"
                              onClick={() =>
                                setActiveSlide((prev) =>
                                  prev - 1 < 0 ? previewImages.length - 1 : prev - 1
                                )
                              }
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              aria-label="下一张"
                              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/35 px-2 py-2 text-white shadow hover:bg-black/55"
                              onClick={() => setActiveSlide((prev) => (prev + 1) % previewImages.length)}
                            >
                              ›
                            </button>
                          </div>
                          <div className="mt-3 flex items-center justify-center gap-2 pb-[10px]">
                            {previewImages.map((_, index) => (
                              <span
                                key={index}
                                className={`h-2.5 w-2.5 rounded-full transition-all ${
                                  index === activeSlide
                                    ? "bg-[#ff2e63] shadow-[0_0_0_4px_rgba(255,46,99,0.12)]"
                                    : "bg-slate-300"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2 px-5 pb-2">
                          <p className="text-base font-semibold leading-relaxed text-slate-900">
                            {copyResult?.title ?? "等待生成的标题"}
                          </p>
                          <p className="whitespace-pre-line text-[13px] leading-6 text-slate-700">
                            {copyResult?.content ?? "正文生成后展示，这里模拟小红书笔记的文案排版效果。"}
                          </p>
                          <div className="flex flex-wrap gap-2 text-[12px] text-slate-700">
                            {(copyResult?.tags?.length
                              ? copyResult.tags
                              : ["#好物分享", "#氛围感", "#编辑预览"]
                            ).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1"
                              >
                                {tag.startsWith("#") ? tag : `#${tag}`}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                          <div className="flex items-center gap-2 text-[12px] text-slate-700">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 shadow-sm">
                                <span className="text-slate-400">✐</span>
                                <span className="text-[12px]">说点什么</span>
                              </div>
                            </div>
                            <button className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 shadow-sm hover:border-slate-300">
                              <span className="text-[#ff2e63]">❤</span>
                              <span className="text-[12px] font-semibold text-slate-800">3.2k</span>
                            </button>
                            <button className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 shadow-sm hover:border-slate-300">
                              <span className="text-[#ffb02c]">★</span>
                              <span className="text-[12px] font-semibold text-slate-800">860</span>
                            </button>
                            <button className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 shadow-sm hover:border-slate-300">
                              <span className="text-[#3b5bdb]">✦</span>
                              <span className="text-[12px] font-semibold text-slate-800">214</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <style jsx global>{`
                @import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap");
              `}</style>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TextLayerNode({
  layer,
  onChange,
  readOnly,
  onZIndexChange,
  omitPosition,
  canvasScale,
}: {
  layer: TextLayer;
  onChange?: (id: string, content: string) => void;
  readOnly?: boolean;
  onZIndexChange?: (id: string, delta: number) => void;
  omitPosition?: boolean;
  canvasScale?: number;
}) {
  const [isEditing, setEditing] = useState(false);
  const [draft, setDraft] = useState(layer.content);

  const normalizedStyle = normalizeStyle(layer.style);
  const visualStyle = useMemo(() => {
    const positionalKeys = new Set(["top", "left", "right", "bottom", "position"]);
    return Object.fromEntries(
      Object.entries(normalizedStyle as Record<string, unknown>).filter(
        ([key]) => !positionalKeys.has(key)
      )
    );
  }, [normalizedStyle]);
  const appliedStyle = omitPosition
    ? { ...visualStyle }
    : ({
        ...normalizedStyle,
        position: "absolute",
      } as React.CSSProperties);

  const scale = canvasScale && canvasScale > 0 ? canvasScale : 1;
  const editingScale = 1 / scale;
  // 编辑弹窗需要抵消画布缩放，但保持自身尺寸不再跟随缩放

  const editorCardStyle: React.CSSProperties = {
    transform: `scale(${editingScale})`,
    transformOrigin: "top left",
    minWidth: "260px",
    width: "320px",
    maxWidth: "460px",
    padding: "14px",
    gap: "12px",
  };

  const textareaStyle: React.CSSProperties = {
    height: "160px",
    width: "100%",
    fontSize: "14px",
    lineHeight: "21px",
    padding: "12px",
  };

  const actionRowStyle: React.CSSProperties = {
    marginTop: "12px",
    gap: "10px",
  };

  return (
    <div
      className="select-none"
      style={{
        ...appliedStyle,
        cursor: readOnly ? "default" : "grab",
      }}
      onDoubleClick={() => {
        if (readOnly) return;
        setEditing(true);
      }}
    >
      {isEditing ? (
        <div
          className="rounded-lg border border-border bg-slate-900/90 text-slate-50 shadow-lg"
          style={editorCardStyle}
        >
          <textarea
            className="resize-none rounded-md border border-border/60 bg-slate-800 text-slate-50 shadow-inner"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={textareaStyle}
          />
          <div className="flex text-sm font-medium text-slate-100" style={actionRowStyle}>
            <button
              type="button"
              className="rounded-full bg-primary px-3 py-1 text-primary-foreground shadow"
              onClick={() => {
                onChange?.(layer.id, draft);
                setEditing(false);
              }}
            >
              保存
            </button>
            <button
              type="button"
              className="rounded-full border border-border/80 px-3 py-1 text-slate-100"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
            {onZIndexChange && (
              <>
                <button
                  type="button"
                  className="rounded-full border border-border/80 px-3 py-1 text-slate-100"
                  onClick={() => onZIndexChange(layer.id, 1)}
                >
                  上移
                </button>
                <button
                  type="button"
                  className="rounded-full border border-border/80 px-3 py-1 text-slate-100"
                  onClick={() => onZIndexChange(layer.id, -1)}
                >
                  下移
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        layer.content
      )}
    </div>
  );
}
