# 📚 RedNote-Agent 数据结构与流转规范

## 1. 核心类型定义 (Core Type Definitions)

请指示 Agent 在 `src/types/schema.ts` 中创建以下接口。所有 AI 生成的 JSON 必须严格遵守此结构。

### Phase 1: 用户输入 (Input)
```typescript
/**
 * 用户输入的原始产品数据
 * 来源: 表单或 JSON 编辑器
 */
export interface ProductInput {
  product_id: string;
  name: string;
  category: string;
  price: number;
  target_audience: string;
  features: string[];
  selling_point: string;
  tone: "温馨治愈" | "活泼俏皮" | "专业测评" | "种草安利" | "简约高级"; // 枚举类型
}
```

### Phase 2: 文案生成 (Copywriting Output)
```typescript
/**
 * Prompt 1 (文案专家) 的输出结果
 * 作用: 用于前端文案预览，并作为 Prompt 2 的输入
 */
export interface CopyResult {
  product_id: string;
  tone: string;       // 继承自 Input
  title: string;      // 必须包含 Emoji
  content: string;    // 小红书正文，含换行符 \n 和 Emoji
  tags: string[];     // 话题标签，如 "#好物推荐"
  
  // 关键字段：用于视觉设计的短语（如 "舒缓颈椎", "云朵触感"）
  selling_keywords: string[]; 
}
```

### Phase 3: 视觉策略 (Visual Strategy Output)
```typescript
/**
 * Prompt 2 (视觉导演) 的输出结果
 * 作用: 提供生图 Prompt，并规划初步的设计蓝图
 */
export interface VisualStrategy {
  // 核心产出：用于调用 Seedream API 的中文提示词
  seedream_prompt_cn: string; 

  // 设计蓝图：传递给 Prompt 3 (Layout) 作为参考
  design_plan: {
    canvas: {
      width: number; // 固定 1080
      height: number; // 固定 1440
    };
    tone: string;
    background_color_hex: string; // 图片加载失败时的兜底色
    
    // 配色方案建议
    color_palette: {
      primary: string;   // 主色
      secondary: string; // 辅色
      accent: string;    // 强调色 (用于 Tag 背景)
    };

    // 布局意图 (Intent)：这只是建议，Prompt 3 会根据实际图片调整坐标
    layout_elements: Array<{
      type: "text";
      content: string;
      is_main_title: boolean;
      style_config: {
        font_family: string;
        font_size: number;
        font_weight: "normal" | "bold" | "900";
        color: string;
        position: {
          top: string; // e.g. "10%"
          left: string; // e.g. "50%"
          align: "left" | "center" | "right";
        };
        effect: "none" | "shadow" | "stroke" | "background_highlight";
      };
    }>;

    // 装饰元素建议
    decorations: Array<{
      type: "svg_icon";
      shape: "star" | "sparkle" | "wave" | "underline" | "circle";
      color: string;
      position: { top: string; left: string };
      size: number;
    }>;
  };
}
```

### Phase 4: 最终图层配置 (Final Layout Config)
```typescript
/**
 * Prompt 3 (视觉排版 + Vision Model) 的输出结果
 * 作用: 前端 React 渲染引擎的直接数据源 (Source of Truth)
 * 对应 Zustand Store 中的 State
 */
export interface LayoutConfig {
  canvas: {
    width: number;
    height: number;
    backgroundImage: string; // 填入 API 返回的图片 URL
    tone: string;
    overlayOpacity?: number; // 可选: 0.1~0.5，用于增加文字对比度
  };

  layers: Layer[];
}

// 联合类型，支持扩展
export type Layer = TextLayer | ShapeLayer;

export interface BaseLayer {
  id: string; // UUID
  style: React.CSSProperties; // 核心：必须是 React 兼容的 CSS 对象 (camelCase)
}

export interface TextLayer extends BaseLayer {
  type: "text";
  content: string;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape" | "svg"; // 简单形状或 SVG 图标
  content?: string;      // 如果是 svg，这里存 svg 代码或 icon name
}
```

### Phase 5: 状态定义
export type AppStatus = 
  | 'IDLE'                // 初始状态，等待输入
  | 'GENERATING_COPY'     // 正在调用 Prompt 1 (文案)
  | 'GENERATING_STRATEGY' // 正在调用 Prompt 2 (视觉策略)
  | 'GENERATING_IMAGE'    // 正在调用 Seedream API (生图)
  | 'GENERATING_LAYOUT'   // 正在调用 Prompt 3 (视觉模型排版)
  | 'COMPLETED'           // 全部完成，允许拖拽编辑
  | 'FAILED';             // 某一步出错