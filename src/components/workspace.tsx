"use client";

import { useMemo, useRef, useState } from "react";
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
          <p className="text-xs text-muted-foreground">
            支持复制；右侧画布后续将同步编辑。
          </p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-[11px] text-secondary-foreground">
          Tone: {copyResult?.tone ?? "未选择"}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        <div className="rounded-lg border border-border/60 bg-card/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-semibold">
              {copyResult?.title ?? "等待 AI 生成标题（需包含 Emoji）"}
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
          <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
            {copyResult?.content ?? "正文生成后在此展示，支持换行与快速复制。"}
          </p>
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
  const { layoutConfig, visualStrategy, setLayoutConfig } = useAppStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportQuality, setExportQuality] = useState<"high" | "medium">("high");
  const dragRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});

  const bgUrl = layoutConfig?.canvas.backgroundImage ?? PLACEHOLDER_BG;
  const overlayOpacity = layoutConfig?.canvas.overlayOpacity ?? 0;
  const logicalSize = layoutConfig
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
    if (!layoutConfig || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const topPercent = (data.y / rect.height) * 100;
    const leftPercent = (data.x / rect.width) * 100;

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
    if (!canvasRef.current) return {};
    const rect = canvasRef.current.getBoundingClientRect();
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
              x: (left / 100) * rect.width,
              y: (top / 100) * rect.height,
            },
          ];
        }
        return [layer.id, { x: left, y: top }];
      })
    );
  }, [layers]);

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
      const scale = exportQuality === "high" ? 1 : 0.85;
      const dataUrl = await toPng(canvasRef.current, {
        width: Math.round(1080 * scale),
        height: Math.round(1440 * scale),
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
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>逻辑尺寸：{logicalSize}</span>
          <span>底图：2304×3072（Seedream）</span>
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
        <label className="ml-2 inline-flex items-center gap-1">
          <span>质量</span>
          <select
            value={exportQuality}
            onChange={(e) => setExportQuality(e.target.value as "high" | "medium")}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="high">高</option>
            <option value="medium">中</option>
          </select>
        </label>
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
              className="absolute inset-0"
              style={{
                backgroundColor: "rgba(0,0,0,0.6)",
                opacity: overlayOpacity,
              }}
            />
          )}
          <div className="absolute inset-0">
            {normalizedLayers.map((layer) =>
              layer.type === "text" ? (
                <div key={layer.id} className="absolute">
                  {/*
                    react-draggable 在 React 19 需要 nodeRef 避免 findDOMNode，
                    因此这里显式提供 ref。
                  */}
                  {(() => {
                    const nodeRef = getNodeRef(layer.id);
                    return (
                      <Draggable
                        nodeRef={nodeRef}
                        defaultPosition={
                          layerPositions[layer.id] ?? {
                            x: parseFloat(String(layer.style.left ?? "0")) || 0,
                            y: parseFloat(String(layer.style.top ?? "0")) || 0,
                          }
                        }
                        bounds="parent"
                        onStop={(_, data) => handleDrag(layer.id, data)}
                      >
                        <div ref={nodeRef}>
                          <TextLayerNode
                            layer={layer}
                            onChange={handleTextUpdate}
                            onZIndexChange={adjustZIndex}
                          />
                        </div>
                      </Draggable>
                    );
                  })()}
                </div>
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-2xl bg-background p-4 shadow-2xl">
            <button
              className="absolute right-3 top-3 rounded-full border border-border px-3 py-1 text-sm hover:bg-muted/60"
              onClick={() => setPreviewOpen(false)}
            >
              关闭
            </button>
            <div className="mt-6 flex items-start gap-4">
              <div className="w-[240px] space-y-2 text-xs text-muted-foreground">
                <p className="text-sm font-semibold text-foreground">预览（手机）</p>
                <p>模拟小红书风格预览；画布保持 3:4。</p>
              </div>
              <div
                className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-border bg-gradient-to-b from-muted/40 to-background shadow-lg"
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
                    className="absolute inset-0"
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
                <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/35 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/35 to-transparent" />
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
}: {
  layer: TextLayer;
  onChange?: (id: string, content: string) => void;
  readOnly?: boolean;
  onZIndexChange?: (id: string, delta: number) => void;
}) {
  const [isEditing, setEditing] = useState(false);
  const [draft, setDraft] = useState(layer.content);
  return (
    <div
      className="absolute select-none"
      style={{
        ...layer.style,
        position: "absolute",
        cursor: readOnly ? "default" : "grab",
      }}
      onDoubleClick={() => {
        if (readOnly) return;
        setEditing(true);
      }}
    >
      {isEditing ? (
        <div className="rounded-lg border border-border bg-background/90 p-2 shadow">
          <textarea
            className="h-20 w-56 resize-none rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-2 flex gap-2 text-xs">
            <button
              type="button"
              className="rounded-full bg-primary px-2 py-1 text-primary-foreground"
              onClick={() => {
                onChange?.(layer.id, draft);
                setEditing(false);
              }}
            >
              保存
            </button>
            <button
              type="button"
              className="rounded-full border border-border px-2 py-1"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
            {onZIndexChange && (
              <>
                <button
                  type="button"
                  className="rounded-full border border-border px-2 py-1"
                  onClick={() => onZIndexChange(layer.id, 1)}
                >
                  上移
                </button>
                <button
                  type="button"
                  className="rounded-full border border-border px-2 py-1"
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
