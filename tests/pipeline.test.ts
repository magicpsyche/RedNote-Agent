import { productInputSchema } from "@/lib/validation";
import { useAppStore } from "@/store/use-app-store";
import type { ProductInput } from "@/types/schema";
import { vi } from "vitest";

const sampleInput: ProductInput = {
  product_id: "P001",
  name: "云朵感记忆棉枕头",
  category: "家居床品",
  price: 129,
  target_audience: "25-35岁，有睡眠困扰的上班族",
  features: ["记忆棉材质，慢回弹", "人体工学曲线，护颈设计", "透气网眼面料，可拆洗"],
  selling_point: "改善睡眠质量，缓解颈椎压力",
  tone: "温馨治愈",
};

describe("productInputSchema", () => {
  it("passes valid payload", () => {
    const parsed = productInputSchema.parse(sampleInput);
    expect(parsed.name).toBe(sampleInput.name);
  });

  it("rejects invalid tone", () => {
    expect(() =>
      productInputSchema.parse({ ...sampleInput, tone: "invalid" })
    ).toThrow();
  });
});

describe("generateAll fallback pipeline", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network blocked")));
    process.env = {
      ...originalEnv,
      CUR_LLM: "",
      CUR_IMAGE: "",
      LLM_API_KEY: "",
      SEEDREAM_API_KEY: "",
      OPENAI_API_KEY: "",
      SSY_LLM_KEY: "",
      SSY_IMAGE_KEY: "",
      ARK_LLM_KEY: "",
      ARK_IMAGE_KEY: "",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  it("returns placeholder outputs without API keys", async () => {
    const { generateAll } = await import("@/app/actions/generate");
    const result = await generateAll(sampleInput);

    expect(result.copy.product_id).toBe(sampleInput.product_id);
    expect(result.copy.selling_keywords.length).toBeGreaterThan(0);
    expect(result.visual.design_plan.canvas.width).toBe(1080);
    expect(result.layout.canvas.backgroundImage).toContain("placehold.co");
    expect(result.layout.canvas.width).toBe(1080);
  }, 10000);
});

describe("useAppStore", () => {
  afterEach(() => {
    useAppStore.getState().reset();
  });

  it("resets to initial state after updates", () => {
    const store = useAppStore.getState();

    store.setStatus("GENERATING_COPY");
    store.setInput(sampleInput);
    store.setError("oops");

    store.reset();
    const next = useAppStore.getState();

    expect(next.status).toBe("IDLE");
    expect(next.input).toBeNull();
    expect(next.error).toBeNull();
  });
});
