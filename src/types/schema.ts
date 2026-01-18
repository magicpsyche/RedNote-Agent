import type { CSSProperties } from "react";

export interface ProductInput {
  product_id: string;
  name: string;
  category: string;
  price: number;
  target_audience: string;
  features: string[];
  selling_point: string;
  tone:
    | "温馨治愈"
    | "活泼俏皮"
    | "专业测评"
    | "种草安利"
    | "简约高级";
}

export interface CopyResult {
  product_id: string;
  tone: string;
  title: string;
  content: string;
  tags: string[];
  selling_keywords: string[];
}

export interface VisualStrategy {
  seedream_prompt_cn: string;
  design_plan: {
    canvas: {
      width: number;
      height: number;
    };
    tone: string;
    background_color_hex: string;
    color_palette: {
      primary: string;
      secondary: string;
      accent: string;
    };
    layout_elements: Array<{
      type: "text";
      content: string;
      is_main_title: boolean;
      style_config: {
        font_family: string;
        font_size: number;
        font_weight: "normal" | "bold" | "900";
        color: string;
        opacity?: number;
        position: {
          top: string;
          left: string;
          align: "left" | "center" | "right";
        };
        effect: "none" | "shadow" | "stroke" | "background_highlight";
      };
    }>;
    decorations: Array<{
      type: "svg_icon";
      shape: "star" | "sparkle" | "wave" | "underline" | "circle";
      color: string;
      position: { top: string; left: string };
      size: number;
    }>;
  };
}

export interface LayoutConfig {
  canvas: {
    width: number;
    height: number;
    backgroundImage: string;
    tone: string;
    overlayOpacity?: number;
  };
  layers: Layer[];
}

export type Layer = TextLayer | ShapeLayer;

export interface BaseLayer {
  id: string;
  style: CSSProperties;
}

export interface TextLayer extends BaseLayer {
  type: "text";
  content: string;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape" | "svg";
  content?: string;
}

export type AppStatus =
  | "IDLE"
  | "GENERATING_COPY"
  | "GENERATING_STRATEGY"
  | "GENERATING_IMAGE"
  | "GENERATING_LAYOUT"
  | "COMPLETED"
  | "FAILED";
