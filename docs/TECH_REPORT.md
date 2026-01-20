# RedNote-Agent 技术报告

## 1. 项目概述
- 定位：面向内容运营/电商的“文案 + 视觉一体化”生成与排版 Agent，产出可编辑的 1080×1440 画布，可导出高分辨率海报。
- 形态：Next.js App Router 前后端一体；前端提供输入、状态提示、画布编辑与导出；后端 Server Actions 串联文案生成、视觉策略生成、Seedream 生图、排版生成。
- 当前默认模型：Chat 端使用可配置的国产/通用 LLM（默认 `gpt-4o-mini`，可通过 `CUR_LLM`/`LLM_*`/`SSY_*`/`ARK_*` 环境变量切换）；生图端默认 `bytedance/doubao-seedream-4.5`（可通过 `CUR_IMAGE`/`SEEDREAM_*` 等切换）。

## 2. 架构设计
- 总体架构：Next.js App Router + Server Actions（`src/app/actions/generate.ts`）+ Zustand 全局状态（`src/store/use-app-store.ts`）+ 前端可视化组件（`src/components`）+ 轻量工具库（`src/lib`）。
- 数据流（分步生成，前端实时展示状态）：
  1) 输入校验：`productInputSchema` (zod) 校验必填字段与 tone 枚举。
  2) 文案生成：`generateCopyAction` 调用 LLM 返回 `CopyResult`（title/content/tags/selling_keywords）。
  3) 视觉策略：`generateVisualStrategyAction` 依据文案生成 Seedream 中文提示词 + 设计计划（布局元素、色板、字体）。
  4) 生图：`generateSeedreamImageAction` 调 Seedream 2304×3072，返回 URL；通过 `toProxyImageUrl` 包装本地代理避免 CORS。
  5) 排版：`generateLayoutConfigAction` 依据文案/设计计划/背景图生成 `LayoutConfig`（canvas 尺寸、overlay、不同比例坐标的图层）。
  6) 前端编辑：`Workspace` 组件渲染画布，文本图层可拖拽/编辑/调 zIndex；`html-to-image` 导出 1080×1440。
- 状态管理：`useAppStore` 持有 `AppStatus`（IDLE/GENERATING_*...）、输入、文案、视觉、布局、临时背景预览、错误信息。
- 画布缩放与导出：逻辑尺寸保持 1080×1440，展示时按容器等比缩放；导出前强制恢复逻辑尺寸、等待字体加载、内联背景。
- CORS/安全：新增 `/api/proxy-image`（仅 http/https，带缓存头）代理远程图片；前端统一通过 `toProxyImageUrl` 包装，避免导出时 canvas 污染。

## 3. Prompt 策略
- Prompt 结构：三段模板，存于 `prompt1.md`（文案）、`prompt2.md`（视觉策略/Seedream）、`prompt3.md`（排版）。
- 文案（prompt1）：要求输出结构化 JSON（product_id/title/content/tags/selling_keywords/tone），强调口吻匹配与卖点突出。
- 视觉（prompt2）：
  - Seedream 中文提示词，必须包含留白描述；负向约束显式排除 `text, watermark, 小红书专业测评, signature, logo, typography, words, low quality, cluttered`。
  - 设计计划：canvas 1080×1440，tone/色板/字体/布局元素（位置百分比、字体、效果）与装饰。
  - 留白强制：根据文字在上/下/左右位置，提示语中必须出现对应留白描述。
- 排版（prompt3）：输入设计计划 + 背景图 URL + 文案（标题/标签），输出包含 canvas 元数据和 `layers` 数组的 JSON；图层支持 text/shape/svg，位置允许绝对数值或百分比。
- 解析与清洗：
  - `loadPromptPair` 解析 <<<SYSTEM>>>/<<<USER>>> 区块。
  - `tryParseJson`/`transformVisualResponse`/`normalizeDesignPlan` 处理 ```json``` 包裹、半结构化输出、字体/色板/位置的兜底。
  - zod schema (`copyResultSchema`/`visualStrategySchema`/`layoutSchema`) 校验并报错提示。

## 4. 关键模块与实现细节
- `src/app/actions/generate.ts`：LLM & Seedream 调用、超时控制、代理包装、prompt 装载、JSON 清洗、schema 校验；支持分步 Action 以便前端流式展示。
- `src/components/input-sandbox.tsx`：表单输入 + 状态展示；串联 Server Actions，阶段更新 store；异常时清理背景预览并设置错误态。
- `src/components/workspace.tsx`：画布编辑/预览/导出；文本图层 Draggable，编辑浮层会按 `canvasScale` 缩放；导出使用 `html-to-image`，背景内联、字体等待、overlay 透明度可调。
- `src/lib/image-proxy.ts` + `src/app/api/proxy-image/route.ts`：统一图片代理，http/https 协议校验，暴露 CORS/缓存头，减小导出污染风险。
- `src/store/use-app-store.ts`：集中管理状态与 reset；包含 `backgroundImagePreview` 以便生图阶段先行显示底图。
- 测试：`tests/pipeline.test.ts` 覆盖输入 schema 校验、缺失 Key 的错误兜底、Zustand reset。

## 5. 鲁棒性与自我修正
- Schema 校验：输入/LLM/布局全链路 zod 校验，避免半结构化结果破坏前端。
- Prompt 清洗：去除反引号围栏、JSON 解析失败回退策略，visual/layout 均有默认字体/色板/位置兜底。
- 背景与导出：通过代理和导出前内联背景，规避跨域污染；导出前等待字体、恢复逻辑尺寸，提升生成一致性。
- 交互容错：生成失败时保留提示并允许重新触发；背景预览独立于最终布局，避免污染状态。

## 6. 运行与复现
- 环境：Node >= 20.9.0，推荐 pnpm；Next.js 16 + React 19。
- 安装与开发：
  ```bash
  pnpm install
  pnpm dev
  # 检查
  pnpm lint
  pnpm test
  ```
- 环境变量（可配置多家）：`CUR_LLM`/`CUR_IMAGE`（SSY|ARK|空），`LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL`，`SEEDREAM_API_KEY`/`SEEDREAM_BASE_URL`/`SEEDREAM_MODEL`，或对应 `SSY_*`/`ARK_*`；缺失 Key 会在 server actions 抛错。
- 入口与目录：App Router 位于 `src/app/page.tsx`；核心逻辑 `src/app/actions/generate.ts`；组件在 `src/components/`；状态在 `src/store/`；工具在 `src/lib/`；Prompt 在根目录 `prompt1-3.md`。
- 评测输出建议：在根目录新增 `outputs/`，放置三道赛题生成结果（如 `outputs/result_task1.json` 等），并在 README 说明生成命令。

## 7. Bad Cases 与解决
- 背景图跨域导致导出失败：增加本地图片代理 + 导出前内联背景，消除 CORS 污染。
- LLM 返回半结构化/混入 Markdown：添加 `tryParseJson` + fenced 处理，视觉策略再经 `transformVisualResponse` 和 zod 校验兜底。
- 文本编辑在缩放画布下易偏移：编辑浮层按 `canvasScale` 逆向缩放，保证鼠标/排版体验一致。
- 环境变量缺失：在 `generateAll` 和各分步 action 中显式检查 apiKey，测试覆盖缺失 Key 时的报错。
- 字体/色板不一致：视觉策略转换时提供默认字体/色板/位置，避免前端渲染异常。

## 8. 模型评价（基于实战）
- Chat 模型（默认 `gpt-4o-mini`，可切国产）：优点是速度和 JSON 遵从度高；缺点是排版结构有时遗漏字段，需要 schema 校验与兜底；在长文档/约束较多时偶见 hallucination。
- Seedream 4.5：中文场景/留白控制表现好，曝光/纹理细腻；缺点是 Prompt 中若未显式负向约束，容易出现水印/文字，需要强制添加 `--no text…` 且在策略阶段执行二次清洗。

## 9. 商业价值与扩展
- 典型场景：小红书/电商商品卡片批量生成、活动海报即时出图、内容运营 A/B 测试。
- 变现潜力：按量计费（文案+生图）、SaaS 团队套餐、API 集成；可接入品牌自有字体/模板、开放批量接口。
- 未来工作：
  - 模型：增加评价与重排（layout scoring）闭环；支持多尺寸（1:1/16:9）和多模型路由。
  - 工程：完善更多集成测试（Server Actions mock）和可观察性（链路日志、成本统计）；支持持久化与历史版本对比。
  - 体验：提供模板库、更多装饰元素、自动裁剪/抠图；批量导出与任务队列。

## 10. 赛题提交建议
- 补齐赛方要求的目录与文件：新增 `agent/`、`requirements.txt`、`main.py`（即便是调用说明/启动指引），并在 README 链接本报告。
- 在 README 指明评测输出路径与生成方法；若录制 Demo（<=3 分钟），附上链接；导出本报告为 PDF 作为加分项。 
