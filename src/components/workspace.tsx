"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Draggable from "react-draggable";
import { toPng } from "html-to-image";

import { useAppStore } from "@/store/use-app-store";
import type { LayoutConfig, TextLayer } from "@/types/schema";

const PLACEHOLDER_BG =
  "https://placehold.co/2304x3072/png?text=%E7%AD%89%E5%BE%85%E5%B0%81%E9%9D%A2%E7%94%9F%E6%88%90";

export function Workspace() {
  const { copyResult, layoutConfig, status } = useAppStore();

  const tags = copyResult?.tags ?? [];

  return (
    <section className="rounded-2xl border border-border/80 bg-card/70 p-5 shadow-sm backdrop-blur">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-primary">Workspace</p>
          <h2 className="text-lg font-semibold leading-tight">
            文案预览 + Canvas 编辑器
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1">
            状态：{status}
          </span>
          <span className="rounded-full bg-muted px-3 py-1">
            文案：{copyResult ? "已生成" : "待生成"}
          </span>
          <span className="rounded-full bg-muted px-3 py-1">
            图层：{layoutConfig?.layers?.length ?? 0}
          </span>
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
  const { copyResult } = useAppStore();
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<number>();

  useEffect(() => {
    return () => {
      if (copyResetRef.current) {
        clearTimeout(copyResetRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    const text = copyResult?.content;
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

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4 shadow-inner">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">文案预览</p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-[11px] text-secondary-foreground">
          {copyResult?.product_id ?? "未生成"}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        <div className="rounded-lg border border-border/60 bg-card/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-semibold">
              {copyResult?.title ?? "等待生成文案"}
            </p>
            <button
              type="button"
              disabled={!copyPresent}
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
          {copyResult?.content && (
            <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
              {copyResult.content}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(tags.length ? tags : ["#话题标签", "#小红书风格", "#等待生成"]).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
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
  const dragRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});

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

  const handleDrag = (id: string, data: { x: number; y: number }) => {
    if (!layoutConfig || !logicalWidth || !logicalHeight) return;
    const topPercent = (data.y / logicalHeight) * 100;
    const leftPercent = (data.x / logicalWidth) * 100;

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
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Canvas 编辑器</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pb-2 text-xs">
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
          {isExporting ? "导出中…" : "导出 1080×1440"}
        </button>
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
                          bounds="parent"
                          scale={canvasScale || 1}
                          onDrag={(_, data) => handleDrag(layer.id, data)}
                          onStop={(_, data) => handleDrag(layer.id, data)}
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
        <div className="fixed inset-0 z-40 overflow-auto bg-black/55 backdrop-blur">
          <div className="flex min-h-screen items-center justify-center px-4 py-8">
            <div className="relative w-full max-w-5xl overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_38%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.04),transparent_42%),rgba(13,13,15,0.92)] shadow-2xl">
              <button
                className="absolute right-4 top-4 rounded-full border border-border/60 bg-black/60 px-4 py-1 text-sm text-white backdrop-blur hover:bg-white/10"
                onClick={() => setPreviewOpen(false)}
              >
                关闭
              </button>
              <div className="grid gap-6 p-6 lg:grid-cols-[320px,1fr] lg:items-start">
                <div className="space-y-3 text-xs text-slate-200">
                  <p className="text-sm font-semibold text-white">预览（小红书风格）</p>
                  <p>顶部为合成封面，底部为笔记文案区，整体居中展现为分享态弹窗。</p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-300">
                    <span className="rounded-full bg-white/10 px-3 py-1">3:4 封面</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">图层可视化</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">文案排版</span>
                  </div>
                </div>
                <div className="mx-auto w-full max-w-[460px] rounded-[32px] bg-[#f7f3ec] shadow-[0_25px_90px_rgba(0,0,0,0.32)] ring-1 ring-black/5">
                  <div className="overflow-hidden rounded-[28px] border border-black/5">
                    <div className="relative w-full bg-slate-900" style={{ aspectRatio: previewRatio }}>
                      <div
                        ref={previewShellRef}
                        className="relative mx-auto h-full w-full"
                        style={{ aspectRatio: `${logicalWidth} / ${logicalHeight}` }}
                      >
                        <div
                          className="absolute inset-0"
                          style={{
                            width: `${logicalWidth}px`,
                            height: `${logicalHeight}px`,
                            transform: `scale(${previewScale})`,
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
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/45 via-black/10 to-transparent" />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3 border-t border-black/5 bg-white/85 px-4 pb-4 pt-3 backdrop-blur">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-red-400 via-amber-200 to-orange-500 shadow-md ring-2 ring-white" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900">RedNote Studio</p>
                          <p className="text-[11px] text-slate-500">30 秒前 · 合成预览</p>
                        </div>
                        <button className="rounded-full bg-[#ff2e63] px-4 py-1 text-xs font-semibold text-white shadow hover:shadow-md">
                          关注
                        </button>
                      </div>
                      <div className="space-y-2 text-slate-900">
                        <p className="text-base font-semibold leading-relaxed">
                          {copyResult?.title ?? "等待生成的标题"}
                        </p>
                        <p className="whitespace-pre-line text-[13px] leading-6 text-slate-700">
                          {copyResult?.content ?? "正文生成后展示，这里模拟小红书笔记的文案排版效果。"}
                        </p>
                        <div className="flex flex-wrap gap-2 text-[12px] text-slate-700">
                          {(copyResult?.tags?.length
                            ? copyResult.tags
                            : ["#好物分享", "#氛围感", "#编辑预览"]).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[12px] text-slate-600">
                        <button className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 shadow-inner">
                          <span>❤</span>
                          <span>3.2k</span>
                        </button>
                        <button className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 shadow-inner">
                          <span>💬</span>
                          <span>126</span>
                        </button>
                        <button className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 shadow-inner">
                          <span>↗</span>
                          <span>分享</span>
                        </button>
                        <span className="ml-auto rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white">
                          {visualStrategy?.design_plan.tone ?? "未设定"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
