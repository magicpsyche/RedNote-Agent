"use server";

import { z } from "zod";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { toProxyImageUrl } from "@/lib/image-proxy";
import type {
  CopyResult,
  LayoutConfig,
  ProductInput,
  VisualStrategy,
} from "@/types/schema";
import { productInputSchema } from "@/lib/validation";

type GenerateAllResult = {
  copy: CopyResult;
  visual: VisualStrategy;
  layout: LayoutConfig;
};

type ProviderKey = "SSY" | "ARK";
type PromptPair = { system: string; user: string };

const DEFAULT_TIMEOUT = 45000;

const copyResultSchema = z.object({
  product_id: z.string(),
  tone: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  selling_keywords: z.array(z.string()).min(1),
});

const designPlanSchema: z.ZodType<VisualStrategy["design_plan"]> = z.object({
  canvas: z.object({
    width: z.number(),
    height: z.number(),
  }),
  tone: z.string(),
  background_color_hex: z.string(),
  color_palette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
  }),
  layout_elements: z.array(
    z.object({
      type: z.literal("text"),
      content: z.string(),
      is_main_title: z.boolean(),
      style_config: z.object({
        font_family: z.string(),
        font_size: z.number(),
        font_weight: z.union([z.literal("normal"), z.literal("bold"), z.literal("900")]),
        color: z.string(),
        opacity: z.number().optional(),
        position: z.object({
          top: z.string(),
          left: z.string(),
          align: z.union([z.literal("left"), z.literal("center"), z.literal("right")]),
        }),
        effect: z.union([
          z.literal("none"),
          z.literal("shadow"),
          z.literal("stroke"),
          z.literal("background_highlight"),
        ]),
      }),
    })
  ),
  decorations: z.array(
    z.object({
      type: z.literal("svg_icon"),
      shape: z.union([
        z.literal("star"),
        z.literal("sparkle"),
        z.literal("wave"),
        z.literal("underline"),
        z.literal("circle"),
      ]),
      color: z.string(),
      position: z.object({
        top: z.string(),
        left: z.string(),
      }),
      size: z.number(),
    })
  ),
});

const visualStrategySchema: z.ZodType<VisualStrategy> = z.object({
  seedream_prompt_cn: z.string(),
  design_plan: designPlanSchema,
});

const layoutSchema: z.ZodType<LayoutConfig> = z.object({
  canvas: z.object({
    width: z.number(),
    height: z.number(),
    backgroundImage: z.string(),
    tone: z.string(),
    overlayOpacity: z.number().optional(),
  }),
  layers: z.array(
    z.object({
      id: z.string(),
      type: z.union([z.literal("text"), z.literal("shape"), z.literal("svg")]),
      content: z.string().optional(),
      style: z.record(z.any()),
    })
  ),
});

const promptCache: Record<string, PromptPair> = {};

export async function generateAll(rawInput: ProductInput): Promise<GenerateAllResult> {
  const input = productInputSchema.parse(rawInput);

  const llmConfig = getLLMConfig();
  const imageConfig = getImageConfig();

  const copy = await generateCopy(input, llmConfig);
  const visual = await generateVisualStrategy(copy, llmConfig);
  const backgroundImage = await generateSeedreamImage(
    visual.seedream_prompt_cn,
    imageConfig
  );
  const proxiedBackgroundImage = toProxyImageUrl(backgroundImage);
  const layout = await generateLayoutConfig({
    copy,
    visual,
    backgroundImage: proxiedBackgroundImage,
    llmConfig,
  });

  return { copy, visual, layout };
}

// 分步 server action，便于前端逐阶段更新状态
export async function generateCopyAction(rawInput: ProductInput): Promise<CopyResult> {
  const input = productInputSchema.parse(rawInput);
  return generateCopy(input, getLLMConfig());
}

export async function generateVisualStrategyAction(
  copy: CopyResult
): Promise<VisualStrategy> {
  return generateVisualStrategy(copy, getLLMConfig());
}

export async function generateSeedreamImageAction(prompt: string): Promise<string> {
  const url = await generateSeedreamImage(prompt, getImageConfig());
  return toProxyImageUrl(url);
}

export async function generateLayoutConfigAction(params: {
  copy: CopyResult;
  visual: VisualStrategy;
  backgroundImage: string;
}): Promise<LayoutConfig> {
  return generateLayoutConfig({ ...params, llmConfig: getLLMConfig() });
}

async function generateCopy(
  input: ProductInput,
  llmConfig: ReturnType<typeof getLLMConfig>
): Promise<CopyResult> {
  if (!llmConfig.apiKey) {
    throw new Error("[generateCopy] missing llm api key");
  }

  const promptPair = await loadPromptPair("prompt1.md");

  const systemPrompt = promptPair.system;
  const userPrompt = fillTemplate(promptPair.user, {
    Product_JSON: JSON.stringify(input),
  });
//   console.info("[USER_PROMPT][文案]", userPrompt);

  try {
    const { content } = await callChatCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.8,
      llmConfig,
    });

    const primaryParsed = tryParseJson(content);
    const parsed = copyResultSchema.safeParse(primaryParsed);
    if (parsed.success) return parsed.data;
    throw new Error("LLM copyResult parse failed");
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("generateCopy 调用 LLM 失败");
  }
}

async function generateVisualStrategy(
  copy: CopyResult,
  llmConfig: ReturnType<typeof getLLMConfig>
): Promise<VisualStrategy> {
  if (!llmConfig.apiKey) {
    throw new Error("[generateVisualStrategy] missing llm api key");
  }

  const promptPair = await loadPromptPair("prompt2.md");

  const systemPrompt = promptPair.system;
  const userPrompt = fillTemplate(promptPair.user, {
    copyResult: JSON.stringify(copy),
  });
//   console.info("[USER_PROMPT][视觉策略]", userPrompt);

  try {
    const { content } = await callChatCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      llmConfig,
    });
    console.info("[LLM_RESPONSE][视觉策略]", content);
    const jsonCandidate = tryParseJson(content);
    const transformed =
      (jsonCandidate && transformVisualResponse(JSON.stringify(jsonCandidate), copy.tone)) ||
      transformVisualResponse(content, copy.tone);
    if (transformed) return transformed;
    throw new Error("LLM visualStrategy parse failed");
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("generateVisualStrategy 调用 LLM 失败");
  }
}

function transformVisualResponse(content: string, tone: string): VisualStrategy | null {
  try {
    const cleaned = (() => {
      const trimmed = content.trim();
      if (trimmed.startsWith("```")) {
        return trimmed.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
      }
      return trimmed;
    })();

    const raw = JSON.parse(cleaned) as {
      seedream_prompt?: string;
      seedream_prompt_cn?: string;
      layout_blueprint?: Array<{
        id?: string;
        type?: string;
        content?: string;
        position?: { top?: string; left?: string; bottom?: string; width?: string; height?: string };
        style?: Record<string, string>;
      }>;
      tone_color_palette?: Record<string, string>;
      font_system?: Record<string, string>;
      design_plan?: unknown;
    };

    const seedreamPrompt = raw.seedream_prompt_cn || raw.seedream_prompt;
    if (!seedreamPrompt) return null;

    const palette = raw.tone_color_palette || {};
    const fontHeading = raw.font_system?.heading_font || "ZCOOL KuaiLe";
    const fontBody = raw.font_system?.body_font || "ZCOOL KuaiLe";

    const paletteFallback = {
      primary: palette.primary_bg || palette.primary_color || "#f59e0b",
      secondary: palette.secondary_accent || palette.secondary_color || "#f1f5f9",
      accent: palette.highlight_accent || palette.accent_color || "#111827",
    };

    const designPlanFromLLM = normalizeDesignPlan(raw.design_plan, tone, {
      palette: paletteFallback,
      fontHeading,
      fontBody,
    });

    const design_plan: VisualStrategy["design_plan"] = {
      canvas: { width: 1080, height: 1440 },
      tone,
      background_color_hex: palette.primary_bg || palette.primary_color || "#f7f4ef",
      color_palette: {
        primary: paletteFallback.primary,
        secondary: paletteFallback.secondary,
        accent: paletteFallback.accent,
      },
      layout_elements: [],
      decorations: [],
    };

    const elements = Array.isArray(raw.layout_blueprint) ? raw.layout_blueprint : [];
    design_plan.layout_elements = elements
      .filter((item) => item.type === "text" && item.content)
      .map((item, idx) => {
        const isMain = item.id === "title_section" || idx === 0;
        const style = item.style || {};
        const posTop = item.position?.top || (item.position?.bottom ? undefined : `${6 + idx * 12}%`);
        const posLeft = item.position?.left || "8%";
        const align =
          style.text_align === "right" ? "right" : style.text_align === "center" ? "center" : "left";

        const fontFamily =
          style.font_family ||
          (isMain ? fontHeading : fontBody) ||
          (tone === "活泼俏皮" ? "ZCOOL QingKe HuangYou" : "ZCOOL KuaiLe");

        const fontSizeRaw = style.font_size || (isMain ? "52px" : "32px");
        const fontSizeNum = parseInt(String(fontSizeRaw).replace(/[^\d]/g, ""), 10) || (isMain ? 52 : 32);

        return {
          type: "text" as const,
          content: item.content ?? "",
          is_main_title: isMain,
          style_config: {
            font_family: fontFamily,
            font_size: fontSizeNum,
            font_weight: (style.font_weight as "normal" | "bold" | "900") || (isMain ? "900" : "bold"),
            color: style.color || "#111827",
            opacity: style.opacity ? Number(style.opacity) : 0.9,
            position: {
              top: posTop || "10%",
              left: posLeft,
              align,
            },
            effect: "shadow",
          },
        };
      });

    const candidate: VisualStrategy = {
      seedream_prompt_cn: seedreamPrompt,
      design_plan: designPlanFromLLM || design_plan,
    };

    const parsed = visualStrategySchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  } catch {
    return null;
  }

  return null;
}

function normalizeDesignPlan(
  rawPlan: unknown,
  tone: string,
  context: {
    palette: { primary: string; secondary: string; accent: string };
    fontHeading: string;
    fontBody: string;
  }
): VisualStrategy["design_plan"] | null {
  if (!rawPlan) return null;

  let resolvedPlan: unknown = rawPlan;
  if (typeof rawPlan === "string") {
    try {
      resolvedPlan = JSON.parse(rawPlan);
    } catch (error) {
      console.warn("[normalizeDesignPlan] design_plan JSON 解析失败", error);
      return null;
    }
  }

  if (!resolvedPlan || typeof resolvedPlan !== "object") return null;

  const planObj = resolvedPlan as Record<string, unknown>;
  const layoutElements = Array.isArray(planObj.layout_elements) ? planObj.layout_elements : [];
  const decorations = Array.isArray(planObj.decorations) ? planObj.decorations : [];

  const toPosString = (value: unknown, fallback: string) => {
    if (typeof value === "number") return `${value}%`;
    if (typeof value === "string" && value.trim()) return value;
    return fallback;
  };

  const normalizedElements = layoutElements
    .filter((item) => item && item.type === "text" && item.content)
    .map((item, idx) => {
      const isMain = Boolean(item.is_main_title) || item.id === "title_section" || idx === 0;
      const style = item.style_config || item.style || {};
      const position = style.position || item.position || {};
      const fontFamily =
        style.font_family ||
        (isMain ? context.fontHeading : context.fontBody) ||
        (tone === "活泼俏皮" ? "ZCOOL QingKe HuangYou" : "ZCOOL KuaiLe");

      const fontSizeRaw = style.font_size ?? (isMain ? "52px" : "32px");
      const fontSizeNum =
        typeof fontSizeRaw === "number"
          ? fontSizeRaw
          : parseInt(String(fontSizeRaw).replace(/[^\d]/g, ""), 10) || (isMain ? 52 : 32);

      const alignRaw = position.align || style.align || style.text_align;
      const align: "left" | "center" | "right" =
        alignRaw === "right" ? "right" : alignRaw === "center" ? "center" : "left";

      const effectRaw = style.effect;
      const effect: VisualStrategy["design_plan"]["layout_elements"][number]["style_config"]["effect"] =
        effectRaw === "none" ||
        effectRaw === "shadow" ||
        effectRaw === "stroke" ||
        effectRaw === "background_highlight"
          ? effectRaw
          : "shadow";

      return {
        type: "text" as const,
        content: String(item.content ?? ""),
        is_main_title: isMain,
        style_config: {
          font_family: fontFamily,
          font_size: fontSizeNum,
          font_weight:
            (style.font_weight as "normal" | "bold" | "900") || (isMain ? "900" : "bold"),
          color: style.color || "#111827",
          opacity: style.opacity ? Number(style.opacity) : 0.9,
          position: {
            top: toPosString(position.top, `${8 + idx * 12}%`),
            left: toPosString(position.left, "8%"),
            align,
          },
          effect,
        },
      };
    });

  const normalizedDecorations = decorations
    .filter((item) => item && item.type === "svg_icon")
    .map((item) => {
      const shape =
        item.shape === "sparkle" ||
        item.shape === "wave" ||
        item.shape === "underline" ||
        item.shape === "circle"
          ? item.shape
          : "star";
      const sizeRaw = item.size ?? 24;
      const size = typeof sizeRaw === "number" ? sizeRaw : parseInt(String(sizeRaw), 10) || 24;
      const position = item.position || {};

      return {
        type: "svg_icon" as const,
        shape,
        color: item.color || context.palette.accent,
        position: {
          top: toPosString(position.top, "10%"),
          left: toPosString(position.left, "10%"),
        },
        size,
      };
    });

  const canvasRaw =
    typeof planObj.canvas === "object" && planObj.canvas !== null
      ? (planObj.canvas as Record<string, unknown>)
      : {};
  const colorPaletteRaw =
    typeof planObj.color_palette === "object" && planObj.color_palette !== null
      ? (planObj.color_palette as Record<string, unknown>)
      : {};
  const toneValue = typeof planObj.tone === "string" && planObj.tone ? planObj.tone : tone;
  const backgroundColor =
    (typeof planObj.background_color_hex === "string" && planObj.background_color_hex) ||
    context.palette.primary ||
    "#f7f4ef";

  const candidate = {
    canvas: {
      width: Number(canvasRaw.width) || 1080,
      height: Number(canvasRaw.height) || 1440,
    },
    tone: toneValue,
    background_color_hex: backgroundColor,
    color_palette: {
      primary:
        (typeof colorPaletteRaw.primary === "string" && colorPaletteRaw.primary) ||
        context.palette.primary,
      secondary:
        (typeof colorPaletteRaw.secondary === "string" && colorPaletteRaw.secondary) ||
        context.palette.secondary,
      accent:
        (typeof colorPaletteRaw.accent === "string" && colorPaletteRaw.accent) ||
        context.palette.accent,
    },
    layout_elements: normalizedElements,
    decorations: normalizedDecorations,
  };

  const parsed = designPlanSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  console.warn("[normalizeDesignPlan] design_plan 验证失败", parsed.error?.message);
  return null;
}

async function generateSeedreamImage(
  prompt: string,
  imageConfig: ReturnType<typeof getImageConfig>
): Promise<string> {
  if (!imageConfig.apiKey) {
    throw new Error("[generateSeedreamImage] missing image api key");
  }

  console.info("[USER_PROMPT][生图]", prompt);

  const endpoint =
    imageConfig.baseUrl?.includes("/images/generations")
      ? imageConfig.baseUrl
      : `${imageConfig.baseUrl?.replace(/\/$/, "")}/images/generations`;

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${imageConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: imageConfig.model,
        prompt,
        size: "2304x3072",
        watermark: false,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Seedream 请求失败: ${response.status} ${await response.text()}`
      );
    }

    const data = (await response.json()) as {
      data?: Array<{ url?: string }>;
    };
    const url = data.data?.[0]?.url;
    if (url) return url;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("generateSeedreamImage 调用失败");
  }
}

async function generateLayoutConfig(params: {
  copy: CopyResult;
  visual: VisualStrategy;
  backgroundImage: string;
  llmConfig: ReturnType<typeof getLLMConfig>;
}): Promise<LayoutConfig> {
  if (!params.llmConfig.apiKey) {
    throw new Error("[generateLayoutConfig] missing llm api key");
  }

  const promptPair = await loadPromptPair("prompt3.md");

  const systemPrompt = promptPair.system;
  const userPrompt = fillTemplate(promptPair.user, {
    "Design Plan": JSON.stringify(params.visual.design_plan),
    "Background Image": params.backgroundImage,
    Copy: JSON.stringify({ title: params.copy.title, tags: params.copy.tags }),
  });
  console.info("[USER_PROMPT][排版]", userPrompt);

  try {
    const { content } = await callChatCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.65,
      llmConfig: params.llmConfig,
    });
    const layoutParsed = tryParseJson(content);
    const parsed = layoutSchema.safeParse(layoutParsed);
    if (parsed.success) {
      return {
        ...parsed.data,
        canvas: {
          ...parsed.data.canvas,
          backgroundImage: toProxyImageUrl(params.backgroundImage),
          tone: params.visual.design_plan.tone,
        },
      };
    }
    throw new Error("LLM layout parse failed");
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("generateLayoutConfig 调用 LLM 失败");
  }
}

type ChatCompletionResult = {
  content: string;
  raw: unknown;
};

async function callChatCompletion({
  systemPrompt,
  userPrompt,
  temperature,
  llmConfig,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  llmConfig: ReturnType<typeof getLLMConfig>;
}): Promise<ChatCompletionResult> {
  const client = createOpenAI({
    apiKey: llmConfig.apiKey || "",
    baseURL: llmConfig.baseUrl,
  });
  const model = client.chat(llmConfig.model);

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

//   console.info("[USER_PROMPT——▲▲▲▲▲]", userPrompt);

  const result = await generateText({
    model,
    messages,
    temperature,
  });

  const content = result.text;
  if (!content) {
    throw new Error("LLM 返回空内容");
  }
  return { content, raw: result.responseMessages };
}

function fetchWithTimeout(url: string, init: RequestInit, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  return fetch(url, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

async function loadPromptFromFile(filename: string): Promise<string | null> {
  try {
    const filePath = path.resolve(process.cwd(), filename);
    const content = await readFile(filePath, "utf-8");
    return content;
  } catch {
    return null;
  }
}

async function loadPromptPair(filename: string): Promise<PromptPair> {
  if (filename in promptCache) return promptCache[filename];

  const content = await loadPromptFromFile(filename);
  if (!content) {
    throw new Error(`[loadPromptPair] 找不到 prompt 文件: ${filename}`);
  }

  const systemMatch = content.match(/<<<SYSTEM>>>([\s\S]*?)<<<END_SYSTEM>>>/);
  const userMatch = content.match(/<<<USER>>>([\s\S]*?)<<<END_USER>>>/);

  if (!systemMatch || !userMatch) {
    throw new Error(`[loadPromptPair] prompt 文件缺少 SYSTEM/USER 区块: ${filename}`);
  }

  const system = cleanPromptBlock(systemMatch[1]);
  const user = cleanPromptBlock(userMatch[1]);

  const pair: PromptPair = { system, user };
  promptCache[filename] = pair;
  return pair;
}

function fillTemplate(template: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce((acc, [key, value]) => {
    const pattern = new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g");
    return acc.replace(pattern, value);
  }, template);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
}

function tryParseJson(content: string | undefined | null): unknown | null {
  if (!content) return null;
  let trimmed = content.trim();
  if (!trimmed) return null;

  // 处理 ```json ... ``` 包裹的情况
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenceMatch) {
    trimmed = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function cleanPromptBlock(block: string): string {
  const trimmed = block.trim();
  // 去掉可能残留的前缀/反引号包裹
  const withoutPrefix = trimmed.replace(/^System_Prompt=`?/i, "").replace(/^User_Prompt=`?/i, "");
  const withoutSuffix = withoutPrefix.replace(/`$/, "").trim();
  return withoutSuffix;
}

function getLLMConfig() {
  const provider = (process.env.CUR_LLM || "").toUpperCase() as ProviderKey;
  const presets: Record<ProviderKey, { apiKey?: string; baseUrl?: string; model?: string }> = {
    SSY: {
      apiKey: process.env.SSY_LLM_KEY,
      baseUrl: process.env.SSY_LLM_BASE_URL,
      model: process.env.SSY_LLM_MODEL,
    },
    ARK: {
      apiKey: process.env.ARK_LLM_KEY,
      baseUrl: process.env.ARK_LLM_BASE_URL,
      model: process.env.ARK_LLM_MODEL,
    },
  };

  const preset = presets[provider];

  return {
    apiKey: preset?.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: preset?.baseUrl || process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    model: preset?.model || process.env.LLM_MODEL || "gpt-4o-mini",
  };
}

function getImageConfig() {
  const provider = (process.env.CUR_IMAGE || "").toUpperCase() as ProviderKey;
  const presets: Record<ProviderKey, { apiKey?: string; baseUrl?: string; model?: string }> = {
    SSY: {
      apiKey: process.env.SSY_IMAGE_KEY,
      baseUrl: process.env.SSY_IMAGE_BASE_URL,
      model: process.env.SSY_IMAGE_MODEL,
    },
    ARK: {
      apiKey: process.env.ARK_IMAGE_KEY,
      baseUrl: process.env.ARK_IMAGE_BASE_URL,
      model: process.env.ARK_IMAGE_MODEL,
    },
  };

  const preset = presets[provider];

  return {
    apiKey: preset?.apiKey || process.env.SEEDREAM_API_KEY || process.env.LLM_API_KEY || "",
    baseUrl:
      preset?.baseUrl ||
      process.env.SEEDREAM_BASE_URL ||
      "https://api.openai.com/v1/images/generations",
    model: preset?.model || process.env.SEEDREAM_MODEL || "bytedance/doubao-seedream-4.5",
  };
}
