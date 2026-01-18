"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Editor from "@monaco-editor/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { generateAll } from "@/app/actions/generate";
import { deriveFromInput } from "@/lib/placeholder";
import { useAppStore } from "@/store/use-app-store";
import type { ProductInput } from "@/types/schema";
import {
  coerceProductInput,
  productInputSchema,
  toneOptions,
} from "@/lib/validation";

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
    setError,
    reset,
  } = useAppStore();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"json" | "form">("json");
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
      setStatus("GENERATING_COPY");

      try {
        const result = await generateAll(payload);
        const stages = [
          () => {
            setCopyResult(result.copy);
            setStatus("GENERATING_STRATEGY");
          },
          () => {
            setVisualStrategy(result.visual);
            setStatus("GENERATING_IMAGE");
          },
          () => {
            setLayoutConfig(result.layout);
            setStatus("GENERATING_LAYOUT");
          },
          () => setStatus("COMPLETED"),
        ];

        stages.forEach((fn, idx) => {
          setTimeout(fn, 140 * idx);
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "生成失败，已使用占位结果";
        setError(message);
        const fallback = deriveFromInput(payload);
        setCopyResult(fallback.copy);
        setVisualStrategy(fallback.visual);
        setLayoutConfig(fallback.layout);
        setStatus("COMPLETED");
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
      setCopyResult,
      setError,
      setInput,
      setLayoutConfig,
      setStatus,
      setVisualStrategy,
    ]
  );

  const simulate = useCallback(() => {
    startTransition(() => {
      void pushToStore(demoInput);
    });
  }, [pushToStore]);

  const handleSubmit = useCallback(
    (payload: ProductInput) => {
      startTransition(() => {
        try {
          const parsed = coerceProductInput(payload);
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
    const base = hydrated ? form.getValues() : demoInput;
    setJsonValue(JSON.stringify(base, null, 2));
    form.reset(base);
    reset();
  }, [form, reset, setError, hydrated]);

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
          <p className="text-xs font-semibold text-primary">Input Sandbox</p>
          <h2 className="text-lg font-semibold leading-tight">输入区</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1">
            底图：2304×3072 → 画布缩放展示
          </span>
          <span className="rounded-full bg-muted px-3 py-1">
            导出目标：1080×1440
          </span>
        </div>
      </div>

      {!collapsed && (
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
          <span className="ml-auto text-xs text-muted-foreground">
            可编辑：Monaco / react-hook-form + zod
          </span>
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
                className="inline-flex items-center justify-center rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow hover:shadow-md transition"
              >
                提交并生成
              </button>
              <p className="text-xs text-muted-foreground">
                输入后提交，数据将写入 Zustand 并触发 Server Action。
              </p>
            </form>
          </div>
        )}
      </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={simulate}
          disabled={isDisabled}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:shadow-md transition disabled:cursor-not-allowed disabled:opacity-70"
        >
          ✨ 模拟 generateAll
        </button>
        <button
          type="button"
          onClick={resetAll}
          disabled={isDisabled}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/60 transition disabled:cursor-not-allowed disabled:opacity-70"
        >
          重置
        </button>
        {activeTab === "json" && (
          <button
            type="button"
            onClick={handleJsonSubmit}
            disabled={isDisabled}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/60 transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            提交 JSON
          </button>
        )}
        {error && (
          <span ref={errorRef} className="text-xs font-semibold text-destructive">{error}</span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted/60 transition"
        >
          {collapsed ? "展开输入区" : "折叠输入区"}
        </button>
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
