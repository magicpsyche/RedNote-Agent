"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Editor from "@monaco-editor/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  generateCopyAction,
  generateLayoutConfigAction,
  generateSeedreamImageAction,
  generateVisualStrategyAction,
} from "@/app/actions/generate";
import { useAppStore } from "@/store/use-app-store";
import type { ProductInput } from "@/types/schema";
import {
  coerceProductInput,
  productInputSchema,
  toneOptions,
} from "@/lib/validation";
import { toProxyImageUrl } from "@/lib/image-proxy";

const demoInput: ProductInput = {
  product_id: "P001",
  name: "云朵感记忆棉枕头",
  category: "家居床品",
  price: 129,
  target_audience: "25-35岁，有睡眠困扰的上班族",
  features: ["记忆棉材质，慢回弹", "人体工学曲线，护颈设计", "透气网眼面料，可拆洗"],
  selling_point: "改善睡眠质量，缓解颈椎压力",
  tone: "温馨治愈",
};

const STORAGE_KEY = "rednote-product-input";
const STORAGE_JSON_KEY = "rednote-product-json";

export function InputSandbox() {
  const {
    status,
    error,
    setStatus,
    setInput,
    setCopyResult,
    setVisualStrategy,
    setLayoutConfig,
    setBackgroundImagePreview,
    setError,
    reset,
  } = useAppStore();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"json" | "form">("form");
  const [jsonValue, setJsonValue] = useState(
    JSON.stringify(demoInput, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const isDisabled = isPending || status === "GENERATING_COPY";
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const errorRef = useRef<HTMLSpanElement | null>(null);

  const form = useForm<ProductInput>({
    defaultValues: demoInput,
    resolver: zodResolver(productInputSchema),
    mode: "onChange",
  });

  const pushToStore = useCallback(
    async (payload: ProductInput) => {
      setError(null);
      setInput(payload);
      setCopyResult(null);
      setVisualStrategy(null);
      setLayoutConfig(null);
      setBackgroundImagePreview(null);
      setStatus("GENERATING_COPY");
      try {
        const copy = await generateCopyAction(payload);
        setCopyResult(copy);
        setStatus("GENERATING_STRATEGY");

        const visual = await generateVisualStrategyAction(copy);
        setVisualStrategy(visual);
        setStatus("GENERATING_IMAGE");

        const bgUrl = await generateSeedreamImageAction(visual.seedream_prompt_cn);
        const safeBgUrl = toProxyImageUrl(bgUrl);
        setStatus("GENERATING_IMAGE"); // 生图完成后再确认一次状态

        // 先行更新画布背景，便于前端立即显示生图
        setBackgroundImagePreview(safeBgUrl);
        setLayoutConfig((prev) => ({
          canvas: {
            width: visual.design_plan.canvas.width,
            height: visual.design_plan.canvas.height,
            backgroundImage: safeBgUrl,
            tone: visual.design_plan.tone,
            overlayOpacity: visual.design_plan.canvas.overlayOpacity ?? 0.05,
          },
          layers: prev?.layers ?? [],
        }));

        // 切换到排版阶段，避免状态栏停留在“生图”
        setStatus("GENERATING_LAYOUT");
        const layout = await generateLayoutConfigAction({ copy, visual, backgroundImage: safeBgUrl });
        setLayoutConfig({
          ...layout,
          canvas: {
            ...layout.canvas,
            backgroundImage: toProxyImageUrl(layout.canvas.backgroundImage),
          },
        });
        setBackgroundImagePreview(null);
        setTimeout(() => setStatus("COMPLETED"), 150);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "生成失败，请检查输入或网络";
        setError(message);
        setBackgroundImagePreview(null);
        setStatus("FAILED");
      }
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
          localStorage.setItem(STORAGE_JSON_KEY, JSON.stringify(payload, null, 2));
        }
      } catch (err) {
        console.warn("Persist input failed", err);
      }
    },
    [
      setBackgroundImagePreview,
      setCopyResult,
      setError,
      setInput,
      setLayoutConfig,
      setStatus,
      setVisualStrategy,
    ]
  );

  const handleSubmit = useCallback(
    (payload: ProductInput) => {
      startTransition(() => {
        try {
          const parsed = coerceProductInput(payload);
          setCollapsed(true);
          void pushToStore(parsed);
        } catch (error) {
          if (error instanceof Error) setError(error.message);
        }
      });
    },
    [pushToStore, setError]
  );

  const handleJsonSubmit = useCallback(() => {
    try {
      const parsed = coerceProductInput(JSON.parse(jsonValue));
      setCollapsed(true);
      handleSubmit(parsed);
      setJsonError(null);
    } catch (error) {
      if (error instanceof Error) setJsonError(error.message);
      else setJsonError("JSON 解析或校验失败");
    }
  }, [handleSubmit, jsonValue]);

  const resetAll = useCallback(() => {
    setError(null);
    setJsonError(null);
    setCollapsed(false);
    setJsonValue(JSON.stringify(demoInput, null, 2));
    form.reset(demoInput);
    reset();
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_JSON_KEY);
      }
    } catch (err) {
      console.warn("Clear persisted input failed", err);
    }
  }, [form, reset, setCollapsed, setError]);

  useEffect(() => {
    if (status === "FAILED" && errorRef.current) {
      setCollapsed(false);
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [status]);

  useEffect(() => {
    if (hydrated) return;
    try {
      const savedJson = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_JSON_KEY) : null;
      const savedInput = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (savedJson) {
        setJsonValue(savedJson);
      }
      if (savedInput) {
        const parsed = coerceProductInput(JSON.parse(savedInput));
        form.reset(parsed);
      }
    } catch (error) {
      console.warn("Restore input failed", error);
    } finally {
      setHydrated(true);
    }
  }, [form, hydrated]);

  return (
    <section className="rounded-2xl border border-border/80 bg-card/70 p-5 shadow-sm backdrop-blur">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-tight">输入区</h2>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "展开输入区" : "折叠输入区"}
          aria-expanded={!collapsed}
          className="inline-flex h-9 w-9 items-center justify-center text-lg font-semibold text-foreground transition-transform duration-300 hover:scale-105 active:scale-95"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            className={`h-4 w-4 transition-transform duration-300 ${
              collapsed ? "-rotate-90" : "rotate-0"
            }`}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div
        className={`grid gap-4 overflow-hidden transition-all duration-500 ease-out ${
          collapsed
            ? "pointer-events-none max-h-0 -translate-y-1 opacity-0"
            : "max-h-[2000px] translate-y-0 opacity-100"
        }`}
      >
        <div className="rounded-xl border border-border/80 bg-background/60 shadow-inner">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <TabButton
              label="JSON 模式"
              active={activeTab === "json"}
              onClick={() => setActiveTab("json")}
            />
            <TabButton
              label="Form 模式"
              active={activeTab === "form"}
              onClick={() => setActiveTab("form")}
            />
          </div>

          {activeTab === "json" ? (
            <div className="p-4">
              <div className="mt-3 h-[260px] overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                <Editor
                  height="100%"
                  defaultLanguage="json"
                  value={jsonValue}
                  onChange={(value) => setJsonValue(value ?? "")}
                  theme="vs-light"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: "on",
                  }}
                />
              </div>
              {jsonError && (
                <p className="mt-2 text-xs font-semibold text-destructive">{jsonError}</p>
              )}
            </div>
          ) : (
            <div className="p-4">
              <form
                className="mt-3 grid gap-2 text-sm"
              onSubmit={form.handleSubmit((values) => {
                setCollapsed(true);
                handleSubmit(values);
              })}
            >
              <div className="grid grid-cols-2 gap-2">
                <FormField form={form} name="product_id" label="产品 ID" />
                  <FormField form={form} name="name" label="产品名称" />
                  <FormField form={form} name="category" label="类目" />
                  <FormField form={form} name="price" label="价格" type="number" />
                  <FormField form={form} name="target_audience" label="人群/痛点" />
                  <FormField form={form} name="selling_point" label="卖点" />
                  <FormField
                    form={form}
                    name="features"
                    label="特色（以逗号分隔）"
                    transform={(value) =>
                      value
                        .split(",")
                        .map((item: string) => item.trim())
                        .filter(Boolean)
                    }
                  />
                  <div className="grid gap-1">
                    <label className="text-xs text-muted-foreground">调性</label>
                    <select
                      className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                      {...form.register("tone")}
                    >
                      {toneOptions.map((tone) => (
                        <option key={tone} value={tone}>
                          {tone}
                        </option>
                      ))}
                    </select>
                    {form.formState.errors.tone && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.tone.message}
                      </p>
                    )}
                  </div>
                </div>
            <button
              type="submit"
              disabled={isPending}
              onClick={() => setCollapsed(true)}
              className="inline-flex items-center justify-center rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow transition hover:shadow-md"
            >
              提交并生成
            </button>
          </form>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={resetAll}
            disabled={isDisabled}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-70"
          >
            重置
          </button>
          {activeTab === "json" && (
            <button
              type="button"
              onClick={handleJsonSubmit}
              disabled={isDisabled}
              onClickCapture={() => setCollapsed(true)}
              className="ml-auto inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-70"
            >
              提交 JSON
            </button>
          )}
          {error && (
            <span ref={errorRef} className="text-xs font-semibold text-destructive">
              {error}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

type FormFieldProps = {
  form: ReturnType<typeof useForm<ProductInput>>;
  name: keyof ProductInput;
  label: string;
  type?: string;
  transform?: (value: string) => string | string[];
};

function FormField({ form, name, label, type = "text", transform }: FormFieldProps) {
  const error = form.formState.errors[name]?.message as string | undefined;
  return (
    <div className="grid gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        {...form.register(name, {
          setValueAs: transform ? (v) => transform(String(v ?? "")) : undefined,
        })}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm font-medium transition ${
        active
          ? "bg-primary text-primary-foreground shadow"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      {label}
    </button>
  );
}
