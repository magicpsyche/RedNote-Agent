"use server";

import { z } from "zod";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { toProxyImageUrl } from "@/lib/image-proxy";
import type { CopyResult, LayoutConfig, ProductInput } from "@/types/schema";
import { productInputSchema } from "@/lib/validation";

type GenerateAllResult = {
  copy: CopyResult;
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
  seedream_prompt_cn: z.string(),
});

const textLayerSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  content: z.string(),
  style: z.record(z.any()),
});

const shapeLayerSchema = z.object({
  id: z.string(),
  type: z.literal("shape"),
  content: z.string().optional(),
  style: z.record(z.any()),
});

const svgLayerSchema = z.object({
  id: z.string(),
  type: z.literal("svg"),
  content: z.string().optional(),
  style: z.record(z.any()),
});

const layoutSchema: z.ZodType<LayoutConfig> = z.object({
  canvas: z.object({
    width: z.number(),
    height: z.number(),
    backgroundImage: z.string(),
    tone: z.string(),
    overlayOpacity: z.number().optional(),
  }),
  layers: z.array(z.discriminatedUnion("type", [textLayerSchema, shapeLayerSchema, svgLayerSchema])),
});

const promptCache: Record<string, PromptPair> = {};

export async function generateAll(rawInput: ProductInput): Promise<GenerateAllResult> {
  const input = productInputSchema.parse(rawInput);

  const llmConfig = getLLMConfig();
  const imageConfig = getImageConfig();

  const copy = await generateCopy(input, llmConfig);
  const backgroundImage = await generateSeedreamImage(copy.seedream_prompt_cn, imageConfig);
  const proxiedBackgroundImage = toProxyImageUrl(backgroundImage);
  const layout = await generateLayoutConfig({
    copy,
    backgroundImage: proxiedBackgroundImage,
    llmConfig,
  });

  return { copy, layout };
}

// 分步 server action，便于前端逐阶段更新状态
export async function generateCopyAction(rawInput: ProductInput): Promise<CopyResult> {
  const input = productInputSchema.parse(rawInput);
  return generateCopy(input, getLLMConfig());
}

export async function generateSeedreamImageAction(prompt: string): Promise<string> {
  const url = await generateSeedreamImage(prompt, getImageConfig());
  return toProxyImageUrl(url);
}

export async function generateLayoutConfigAction(params: {
  copy: CopyResult;
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
    throw new Error("Seedream 返回空结果");
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("generateSeedreamImage 调用失败");
  }
}

async function generateLayoutConfig(params: {
  copy: CopyResult;
  backgroundImage: string;
  llmConfig: ReturnType<typeof getLLMConfig>;
}): Promise<LayoutConfig> {
  if (!params.llmConfig.apiKey) {
    throw new Error("[generateLayoutConfig] missing llm api key");
  }

  const promptPair = await loadPromptPair("prompt3.md");

  const systemPrompt = promptPair.system;
  const userPrompt = fillTemplate(promptPair.user, {
    copyResult: JSON.stringify(params.copy),
    BackgroundImage: params.backgroundImage,
  });
  console.info("[USER_PROMPT][prompt3]", userPrompt);

  try {
    const { content } = await callChatCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.65,
      llmConfig: params.llmConfig,
    });
    console.info("[LLM_RESPONSE][prompt3]", content);
    const layoutParsed = tryParseJson(content);
    const parsed = layoutSchema.safeParse(layoutParsed);
    if (parsed.success) {
      return {
        ...parsed.data,
        canvas: {
          ...parsed.data.canvas,
          backgroundImage: toProxyImageUrl(params.backgroundImage),
          tone: params.copy.tone,
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
  return { content, raw: result };
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

  // 处理包含 ```json ... ``` 的情况（即使前后有额外说明也能截取）
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    trimmed = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // 回退：尝试截取首尾大括号之间的内容，容错设计说明等额外文本
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const slice = trimmed.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
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
