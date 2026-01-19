"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Draggable from "react-draggable";
import { toPng } from "html-to-image";

import { useAppStore } from "@/store/use-app-store";
import type { LayoutConfig, TextLayer } from "@/types/schema";

const PLACEHOLDER_BG =
  "https://placehold.co/2304x3072/png?text=Seedream+2304x3072";

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

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4 shadow-inner">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">文案预览</p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-[11px] text-secondary-foreground">
          Tone: {copyResult?.tone ?? "未选择"}
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
              onClick={() => {
                if (copyResult?.content) void navigator.clipboard.writeText(copyResult.content);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              复制正文
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
  const { layoutConfig, visualStrategy, setLayoutConfig, copyResult } = useAppStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const dragRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});

  const bgUrl = layoutConfig?.canvas?.backgroundImage ?? PLACEHOLDER_BG;
  const overlayOpacity = layoutConfig?.canvas?.overlayOpacity ?? 0;
  const logicalSize =
    layoutConfig?.canvas?.width && layoutConfig?.canvas?.height
      ? `${layoutConfig.canvas.width}×${layoutConfig.canvas.height}`
      : "1080×1440";

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
    if (!layoutConfig || !canvasSize.width || !canvasSize.height) return;
    const topPercent = (data.y / canvasSize.height) * 100;
    const leftPercent = (data.x / canvasSize.width) * 100;

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
    if (!canvasSize.width || !canvasSize.height) return {};
    return Object.fromEntries(
      layers.map((layer) => {
        const style = normalizeStyle(layer.style);
        const top = parseFloat(String(style.top ?? "0"));
        const left = parseFloat(String(style.left ?? "0"));
        const isPercent =
          String(style.top ?? "").includes("%") ||
          String(style.left ?? "").includes("%");
        if (isPercent) {
          return [
            layer.id,
            {
              x: (left / 100) * canvasSize.width,
              y: (top / 100) * canvasSize.height,
            },
          ];
        }
        return [layer.id, { x: left, y: top }];
      })
    );
  }, [layers, canvasSize]);

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
    if (!canvasRef.current || !layoutConfig) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(canvasRef.current, {
        width: 1080,
        height: 1440,
        style: {
          width: `${1080}px`,
          height: `${1440}px`,
        },
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "rednote-cover.png";
      link.click();
    } catch (error) {
      console.error("Export failed", error);
    } finally {
      setIsExporting(false);
    }
  };

  const previewRatio = 3 / 4;

  useEffect(() => {
    if (!canvasRef.current) return;
    const updateSize = () => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCanvasSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

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
          ref={canvasRef}
          className="relative mx-auto"
          style={{
            aspectRatio: "3 / 4",
            maxWidth: "100%",
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
                  return (
                    <Draggable
                      key={`${layer.id}-${canvasSize.width}-${canvasSize.height}`}
                      nodeRef={nodeRef}
                      defaultPosition={position}
                      bounds="parent"
                      onStop={(_, data) => handleDrag(layer.id, data)}
                    >
                      <div ref={nodeRef} style={{ position: "absolute", zIndex: (layer.style as { zIndex?: number }).zIndex ?? 1 }}>
                        <TextLayerNode
                          layer={layer}
                          onChange={handleTextUpdate}
                          onZIndexChange={adjustZIndex}
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
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white backdrop-blur">
            Tone: {visualStrategy?.design_plan.tone ?? "未设定"}
          </div>
        </div>
      </div>

      {isPreviewOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-4 py-8 backdrop-blur">
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
                  <div
                    className="relative w-full bg-slate-900"
                    style={{ aspectRatio: previewRatio }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `url(${bgUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
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
                      {layers.map((layer) =>
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
                        {(copyResult?.tags?.length ? copyResult.tags : ["#好物分享", "#氛围感", "#编辑预览"]).map(
                          (tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1"
                            >
                              {tag}
                            </span>
                          )
                        )}
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
}: {
  layer: TextLayer;
  onChange?: (id: string, content: string) => void;
  readOnly?: boolean;
  onZIndexChange?: (id: string, delta: number) => void;
  omitPosition?: boolean;
}) {
  const [isEditing, setEditing] = useState(false);
  const [draft, setDraft] = useState(layer.content);

  const normalizedStyle = normalizeStyle(layer.style);
  const { top, left, right, bottom, position, ...visualStyle } = normalizedStyle as Record<
    string,
    unknown
  >;
  const appliedStyle = omitPosition
    ? { ...visualStyle }
    : ({
        ...normalizedStyle,
        position: "absolute",
      } as React.CSSProperties);

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
        <div className="rounded-lg border border-border bg-slate-900/90 p-2 text-slate-50 shadow-lg">
          <textarea
            className="h-24 w-64 resize-none rounded-md border border-border/60 bg-slate-800 px-3 py-2 text-sm text-slate-50 shadow-inner"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-2 flex gap-2 text-xs text-slate-100">
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
