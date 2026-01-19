"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
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

const DEFAULT_IMAGE_PLACEHOLDER =
  "https://placehold.co/2304x3072/png?text=Seedream+2304x3072";
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

let prompt2Cache: string | null = null;

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

async function generateCopy(
  input: ProductInput,
  llmConfig: ReturnType<typeof getLLMConfig>
): Promise<CopyResult> {
  const fallback = createCopyPlaceholder(input);

  if (!llmConfig.apiKey) {
    console.warn("[generateCopy] missing llm api key, fallback");
    return fallback;
  }

  const systemPrompt = [
    "你是一个拥有百万粉丝的小红书金牌种草博主，擅长用网感语言写爆款文案。",
    "根据输入产品 JSON 生成包含标题/正文/标签/关键词的结构化结果，严格输出 JSON。",
    "标题必须含 Emoji，正文需分段并包含目标人群痛点，避免绝对化用词。",
  ].join("\n");

  const userPrompt = `Product_JSON: ${JSON.stringify(input)}`;

  try {
    const content = await callChatCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.8,
      llmConfig,
    });
    const parsed = copyResultSchema.safeParse(JSON.parse(content));
    if (parsed.success) return parsed.data;
  } catch (error) {
    console.error("[generateCopy] 使用 LLM 失败，fallback 占位", error);
  }

  return fallback;
}

async function generateVisualStrategy(
  copy: CopyResult,
  llmConfig: ReturnType<typeof getLLMConfig>
): Promise<VisualStrategy> {
  const fallback = createVisualPlaceholder(copy);

  if (!llmConfig.apiKey) {
    console.warn("[generateVisualStrategy] missing llm api key, fallback");
    return fallback;
  }

  const prompt2Content =
    (await loadPromptFromFile("prompt2.md")) ||
    [
      "你是小红书视觉设计总监，需输出 Seedream 中文生图提示词与排版设计蓝图。",
      "结合 tone 映射色板与字体，返回 JSON，canvas 固定 1080x1440，使用百分比定位。",
    ].join("\n");

  const userPrompt = `copyResult: ${JSON.stringify(copy)}`;

  try {
    const content = await callChatCompletion({
      systemPrompt: prompt2Content,
      userPrompt,
      temperature: 0.7,
      llmConfig,
    });
    const transformed = transformVisualResponse(content, copy.tone);
    if (transformed) return transformed;
  } catch (error) {
    console.error("[generateVisualStrategy] 使用 LLM 失败，fallback 占位", error);
  }

  return fallback;
}

function transformVisualResponse(content: string, tone: string): VisualStrategy | null {
  try {
    const raw = JSON.parse(content) as {
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
    return DEFAULT_IMAGE_PLACEHOLDER;
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
    console.error("[generateSeedreamImage] 生成失败，使用占位图", error);
  }

  return DEFAULT_IMAGE_PLACEHOLDER;
}

async function generateLayoutConfig(params: {
  copy: CopyResult;
  visual: VisualStrategy;
  backgroundImage: string;
  llmConfig: ReturnType<typeof getLLMConfig>;
}): Promise<LayoutConfig> {
  const fallback = createLayoutPlaceholder(params.copy, params.visual, params.backgroundImage);

  if (!params.llmConfig.apiKey) {
    console.warn("[generateLayoutConfig] missing llm api key, fallback");
    return fallback;
  }

  const systemPrompt = [
    "你是精通 React/Tailwind 的前端专家，读取背景图 URL 与设计蓝图，输出 Canvas 图层 JSON。",
    "仅支持 text/shape/svg 图层，位置使用绝对定位，禁止用 transform 位移居中。",
    "返回 JSON，包含 canvas 信息与 layers，确保 backgroundImage 字段填入给定 URL。",
  ].join("\n");

  const userPrompt = [
    `Design Plan: ${JSON.stringify(params.visual.design_plan)}`,
    `Background Image: ${params.backgroundImage}`,
    `Copy: ${JSON.stringify({ title: params.copy.title, tags: params.copy.tags })}`,
    "Rules: \n- canvas 1080x1440, use position absolute with % where possible\n- no transform translate for positioning\n- text layers only, font from plan font_family, color palette primary/secondary/accent\n- ensure readability on given backgroundImage; add textShadow if high contrast needed\n- include at least: title layer, 3 selling keyword tags, optional slogan\n- align with design_plan layout_elements positions (top/left %).",
  ].join("\n");

  try {
    const content = await callChatCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.65,
      llmConfig: params.llmConfig,
    });
    const parsed = layoutSchema.safeParse(JSON.parse(content));
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
  } catch (error) {
    console.error("[generateLayoutConfig] 使用 LLM 失败，fallback 占位", error);
  }

  return fallback;
}

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
}): Promise<string> {
  const response = await fetchWithTimeout(`${llmConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      response_format: { type: "json_object" },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`LLM 请求失败: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM 返回空内容");
  }
  return content;
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
  if (filename === "prompt2.md" && prompt2Cache) return prompt2Cache;
  try {
    const filePath = path.resolve(process.cwd(), filename);
    const content = await readFile(filePath, "utf-8");
    if (filename === "prompt2.md") prompt2Cache = content;
    return content;
  } catch (error) {
    console.warn(`[loadPromptFromFile] 读取失败: ${filename}`, error);
    return null;
  }
}

function createCopyPlaceholder(input: ProductInput): CopyResult {
  return {
    product_id: input.product_id,
    tone: input.tone,
    title: `示例标题 ✨ ${input.name}`,
    content: `为${input.target_audience}准备的${input.name}。\n这里展示文案生成的占位内容。`,
    tags: ["#示例", "#等待AI生成", "#RedNote"],
    selling_keywords: input.features.slice(0, 3),
  };
}

function createVisualPlaceholder(copy: CopyResult): VisualStrategy {
  const sellingKeywords = copy.selling_keywords.slice(0, 3);
  return {
    seedream_prompt_cn: `${copy.title} 的示例生图提示词（待替换）`,
    design_plan: {
      canvas: {
        width: 1080,
        height: 1440,
      },
      tone: copy.tone,
      background_color_hex: "#f2f2f2",
      color_palette: {
        primary: "#ff6b6b",
        secondary: "#ffffff",
        accent: "#18181b",
      },
      layout_elements: sellingKeywords.map((keyword, index) => ({
        type: "text",
        content: keyword,
        is_main_title: index === 0,
        style_config: {
          font_family: "ZCOOL KuaiLe",
          font_size: index === 0 ? 52 : 36,
          font_weight: index === 0 ? "900" : "bold",
          color: "#18181b",
          opacity: 0.9,
          position: {
            top: `${16 + index * 12}%`,
            left: "8%",
            align: "left",
          },
          effect: "shadow",
        },
      })),
      decorations: [
        {
          type: "svg_icon",
          shape: "sparkle",
          color: "#ff6b6b",
          position: { top: "12%", left: "82%" },
          size: 28,
        },
      ],
    },
  };
}

function createLayoutPlaceholder(
  copy: CopyResult,
  visual: VisualStrategy,
  backgroundImage: string
): LayoutConfig {
  const { width, height } = visual.design_plan.canvas;

  return {
    canvas: {
      width,
      height,
      backgroundImage,
      tone: visual.design_plan.tone,
      overlayOpacity: 0.15,
    },
    layers: [
      {
        id: nanoid(),
        type: "text",
        content: copy.title,
        style: {
          position: "absolute",
          top: "10%",
          left: "0",
          width: "100%",
          textAlign: "center",
          fontFamily: "ZCOOL QingKe HuangYou",
          fontSize: "64px",
          fontWeight: 900,
          color: "#0f172a",
          textShadow: "0 4px 10px rgba(0,0,0,0.12)",
          zIndex: 10,
        },
      },
      ...copy.selling_keywords.map((keyword, index) => ({
        id: nanoid(),
        type: "text" as const,
        content: keyword,
        style: {
          position: "absolute",
          top: `${28 + index * 12}%`,
          left: "6%",
          padding: "12px 18px",
          borderRadius: "16px",
          backgroundColor: "rgba(255,255,255,0.78)",
          color: "#111827",
          fontSize: "32px",
          fontWeight: 700,
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        },
      })),
    ],
  };
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
