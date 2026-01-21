import { nanoid } from "nanoid";

import type {
  CopyResult,
  LayoutConfig,
  ProductInput,
  VisualStrategy,
} from "@/types/schema";

export function deriveFromInput(input: ProductInput): {
  copy: CopyResult;
  visual: VisualStrategy;
  layout: LayoutConfig;
} {
  const sellingKeywords =
    input.features.length >= 3
      ? input.features.slice(0, 3)
      : [...input.features, input.selling_point].slice(0, 3);

  const copy: CopyResult = {
    product_id: input.product_id,
    tone: input.tone,
    title: `${input.name} · 小憩放松 ☁️`,
    content: `${input.target_audience} 的睡前舒缓选择，${input.selling_point}。\n核心特色：${input.features.join(
      "；"
    )}\n想试试让颈椎轻松入睡吗？`,
    tags: [
      "#治愈睡眠",
      "#家居好物",
      "#护颈",
      "#放松肩颈",
      `#${input.category}`,
    ],
    selling_keywords: sellingKeywords,
    seedream_prompt_cn: `柔和晨光卧室，云朵感记忆棉枕头特写，突出慢回弹护颈曲线，顶部留白放文字，右上角小贴纸，ins 风，8K，干净背景，tone: ${input.tone} --no text, watermark, signature, logo, typography, words, cluttered, low quality`,
  };

  const visual: VisualStrategy = {
    seedream_prompt_cn: copy.seedream_prompt_cn,
    design_plan: {
      canvas: { width: 1080, height: 1440 },
      tone: input.tone,
      background_color_hex: "#f7f4ef",
      color_palette: {
        primary: "#f59e0b",
        secondary: "#f1f5f9",
        accent: "#111827",
      },
      layout_elements: sellingKeywords.map((keyword, idx) => ({
        type: "text",
        content: keyword,
        is_main_title: idx === 0,
        style_config: {
          font_family: "ZCOOL KuaiLe",
          font_size: idx === 0 ? 42 : 32,
          font_weight: idx === 0 ? "900" : "bold",
          color: "#111827",
          opacity: 0.92,
          position: {
            top: `${18 + idx * 10}%`,
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
          color: "#f59e0b",
          position: { top: "12%", left: "82%" },
          size: 26,
        },
      ],
    },
  };

  const layout: LayoutConfig = {
    canvas: {
      width: 1080,
      height: 1440,
      backgroundImage:
        "https://placehold.co/2304x3072/png?text=Seedream+2304x3072",
      tone: input.tone,
      overlayOpacity: 0.12,
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
          fontSize: "60px",
          fontWeight: 900,
          color: "#0f172a",
          textShadow: "0 4px 14px rgba(0,0,0,0.12)",
          zIndex: 10,
        },
      },
      ...sellingKeywords.map((keyword, index) => ({
        id: nanoid(),
        type: "text" as const,
        content: keyword,
        style: {
          position: "absolute",
          top: `${26 + index * 12}%`,
          left: "6%",
          padding: "10px 16px",
          borderRadius: "16px",
          backgroundColor: "rgba(255,255,255,0.85)",
          color: "#111827",
          fontSize: "28px",
          fontWeight: 700,
          boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
        },
      })),
    ],
  };

  return { copy, visual, layout };
}
