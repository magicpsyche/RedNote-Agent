import type { CopyResult, LayoutConfig, ProductInput, VisualStrategy } from "@/types/schema";

export type GenerateResponse = {
  copy: CopyResult;
  visual: VisualStrategy;
  layout: LayoutConfig;
};

export async function callGenerate(input: ProductInput): Promise<GenerateResponse> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "生成失败");
  }

  return res.json();
}
