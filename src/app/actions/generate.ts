"use server";

import { z } from "zod";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

const visualStrategySchema: z.ZodType<VisualStrategy> = z.object({
  seedream_prompt_cn: z.string(),
  design_plan: z.object({
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
  }),
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

  console.log("[generateAll] start", {
    product_id: input.product_id,
    llmBase: llmConfig.baseUrl,
    llmModel: llmConfig.model,
    llmKeyPresent: Boolean(llmConfig.apiKey),
    imageBase: imageConfig.baseUrl,
    imageModel: imageConfig.model,
    imageKeyPresent: Boolean(imageConfig.apiKey),
  });

  const copy = await generateCopy(input, llmConfig);
  console.log("[generateAll] copy done", { title: copy.title });
  const visual = await generateVisualStrategy(copy, llmConfig);
  console.log("[generateAll] visual done", {
    promptPreview: visual.seedream_prompt_cn.slice(0, 40),
  });
  const backgroundImage = await generateSeedreamImage(
    visual.seedream_prompt_cn,
    imageConfig
  );
  console.log("[generateAll] image done", {
    backgroundImage: backgroundImage.slice(0, 80),
  });
  const layout = await generateLayoutConfig({
    copy,
    visual,
    backgroundImage,
    llmConfig,
  });
  console.log("[generateAll] layout done", {
    layers: layout.layers.length,
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
  return generateSeedreamImage(prompt, getImageConfig());
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

  try {
    const { content, raw } = await callChatCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.8,
      llmConfig,
    });
    console.log("[generateCopy] raw llm content:", content);
    console.log("[generateCopy] raw llm response object:", raw);

    const primaryParsed = tryParseJson(content);
    const parsed = copyResultSchema.safeParse(primaryParsed);
    if (parsed.success) return parsed.data;
    console.warn("[generateCopy] parse failed, content preview:", content.slice(0, 200));
    throw new Error("LLM copyResult parse failed");
  } catch (error) {
    console.error("[generateCopy] 使用 LLM 失败", error);
    throw error;
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

  try {
    const { content } = await callChatCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      llmConfig,
    });
    const jsonCandidate = tryParseJson(content);
    const transformed =
      (jsonCandidate && transformVisualResponse(JSON.stringify(jsonCandidate), copy.tone)) ||
      transformVisualResponse(content, copy.tone);
    if (transformed) return transformed;
    console.warn("[generateVisualStrategy] transform failed, content preview:", content.slice(0, 200));
    throw new Error("LLM visualStrategy parse failed");
  } catch (error) {
    console.error("[generateVisualStrategy] 使用 LLM 失败", error);
    throw error;
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
    };

    const seedreamPrompt = raw.seedream_prompt_cn || raw.seedream_prompt;
    if (!seedreamPrompt) return null;

    const palette = raw.tone_color_palette || {};
    const fontHeading = raw.font_system?.heading_font || "ZCOOL KuaiLe";
    const fontBody = raw.font_system?.body_font || "ZCOOL KuaiLe";

    const design_plan: VisualStrategy["design_plan"] = {
      canvas: { width: 1080, height: 1440 },
      tone,
      background_color_hex: palette.primary_bg || palette.primary_color || "#f7f4ef",
      color_palette: {
        primary: palette.primary_bg || palette.primary_color || "#f59e0b",
        secondary: palette.secondary_accent || palette.secondary_color || "#f1f5f9",
        accent: palette.highlight_accent || palette.accent_color || "#111827",
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
      design_plan,
    };

    const parsed = visualStrategySchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  } catch (error) {
    console.error("[transformVisualResponse] parse failed", error);
    return null;
  }

  return null;
}

async function generateSeedreamImage(
  prompt: string,
  imageConfig: ReturnType<typeof getImageConfig>
): Promise<string> {
  if (!imageConfig.apiKey) {
    throw new Error("[generateSeedreamImage] missing image api key");
  }

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
    console.error("[generateSeedreamImage] 生成失败", error);
    throw error;
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
          backgroundImage: params.backgroundImage,
          tone: params.visual.design_plan.tone,
        },
      };
    }
    console.warn("[generateLayoutConfig] parse failed, content preview:", content.slice(0, 200));
    throw new Error("LLM layout parse failed");
  } catch (error) {
    console.error("[generateLayoutConfig] 使用 LLM 失败", error);
    throw error;
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

  // 调试用：打印请求设置与完整 payload（不含 key）
  const payload = {
    baseURL: llmConfig.baseUrl,
    model: llmConfig.model,
    temperature,
    messages,
  };
  console.log("[callChatCompletion] systemPrompt length:", systemPrompt.length);
  console.log("[callChatCompletion] userPrompt length:", userPrompt.length);
  console.log("[callChatCompletion] systemPrompt head:", systemPrompt.slice(0, 120));
  console.log("[callChatCompletion] systemPrompt tail:", systemPrompt.slice(-200));
  console.log("[callChatCompletion] payload (pretty):", JSON.stringify(payload, null, 2));

  const result = await generateText({
    model,
    messages,
    temperature,
  });

  console.log("[callChatCompletion] usage:", result.usage);
  console.log("[callChatCompletion] responseMessages:", result.responseMessages);

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
  } catch (error) {
    console.warn(`[loadPromptFromFile] 读取失败: ${filename}`, error);
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
    console.warn("[tryParseJson] parse failed, preview:", trimmed.slice(0, 200));
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
