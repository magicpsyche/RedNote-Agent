Input：
<img width="1199" height="696" alt="1" src="https://github.com/user-attachments/assets/1edded51-d186-4ceb-9728-b26039daedfd" />



Workspace：
<img width="1236" height="1065" alt="3" src="https://github.com/user-attachments/assets/fd354ad2-83dd-484a-a958-6045951cb8fd" />
<img width="1249" height="1062" alt="4" src="https://github.com/user-attachments/assets/b4530167-edd5-49ea-bd8c-5155a9a09406" />




Preview：
<img width="1920" height="1079" alt="5" src="https://github.com/user-attachments/assets/8f8a1fa2-dc26-4b91-b308-60f3d0747fd2" />






# RedNote-Agent 技术报告

## 1. 项目概述
- 定位：面向小红书内容运营及电商的“文案  + 生图 + 排版一体化” Agent。
- 形态：Next.js App Router 前后端一体；前端提供输入、状态提示、画布编辑与导出；后端 Server Actions 串联文案生成、Seedream 生图、排版生成（视觉策略阶段暂缓）。
- 当前默认模型：`bytedance/doubao-1.8`；生图端默认 `bytedance/doubao-seedream-4.5`。

## 2. 架构设计
- 总体架构：Next.js App Router + Server Actions + Zustand 全局状态 + 前端可视化组件 + 轻量工具库。
- 数据流：
  1) 输入校验：`productInputSchema` 校验必填字段与 tone 枚举。
  2) 文案生成：`generateCopyAction` 调用 LLM 返回 `CopyResult`，直接携带 `seedream_prompt_cn`。
  3) 生图：`generateSeedreamImageAction` 使用文案内的 `seedream_prompt_cn` 调 Seedream 2304×3072，返回 URL；通过 `toProxyImageUrl` 包装本地代理避免 CORS。
  4) 排版：`generateLayoutConfigAction` 依据文案与背景图生成 `LayoutConfig`。
  5) 前端编辑：`Workspace` 组件渲染画布，文本图层可拖拽、编辑及调整 zIndex；`html-to-image` 导出 1080×1440。
- 状态管理：`useAppStore` 持有 `AppStatus`、输入、文案、布局、临时背景预览、错误信息。
- 画布缩放与导出：逻辑尺寸保持 1080×1440，展示时按容器等比缩放；导出前强制恢复逻辑尺寸、等待字体加载、内联背景。
- CORS与安全：新增 `/api/proxy-image` 代理远程图片；前端统一通过 `toProxyImageUrl` 包装，避免导出时 canvas 污染。

## 3. Prompt 策略
- Prompt 结构：三段模板，`prompt2.md` 暂停使用，当前链路为 `prompt1.md -> Seedream -> prompt3.md`。
- 文案：要求输出结构化 JSON，强调口吻匹配与卖点突出。
- 视觉提示：Seedream 中文提示词直接由 prompt1 生成，必须包含留白描述及负向约束（文字/水印/低质量等）。
- 排版：输入文案（含 tone/selling_keywords）与背景图 URL，输出包含 canvas 元数据和 `layers` 数组的 JSON；图层支持位置允许绝对数值或百分比。

## 4. 关键模块与实现细节
- `src/app/actions/generate.ts`：LLM & Seedream 调用、超时控制、代理包装、prompt 装载、JSON 清洗、schema 校验；支持分步 Action 以便前端流式展示。
- `src/components/input-sandbox.tsx`：表单输入与状态展示；串联 Server Actions，阶段更新 store；异常时清理背景预览并设置错误态。
- `src/components/workspace.tsx`：画布编辑、预览及导出；文本图层可拖拽，编辑浮层会按 `canvasScale` 缩放；导出使用 `html-to-image`，背景内联、字体等待、overlay 透明度可调。
- `src/lib/image-proxy.ts` 与 `src/app/api/proxy-image/route.ts`：统一图片代理，http/https 协议校验，暴露 CORS及缓存头，减小导出污染风险。
- `src/store/use-app-store.ts`：集中管理状态与 reset；包含 `backgroundImagePreview` 以便生图阶段先行显示底图。
- 测试：`tests/pipeline.test.ts` 覆盖输入 schema 校验、缺失 Key 的错误兜底、Zustand reset。

## 5. 鲁棒性与自我修正
- Schema 校验：输入、LLM及布局全链路 zod 校验，避免半结构化结果破坏前端。
- Prompt 清洗：去除反引号围栏、JSON 解析失败回退策略，视觉及布局均有默认字体、色板、位置兜底。
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
- 访问方式：
    本机：http://localhost:3000
    局域网其他设备：http://<主机IP>:3000
- 环境变量：`CUR_LLM`、`CUR_IMAGE`，以及对应的 API KEY、BASE URL 和 MODEL 配置。
- 入口与目录：App Router 位于 `src/app/page.tsx`；核心逻辑 `src/app/actions/generate.ts`；组件在 `src/components/`；状态在 `src/store/`；工具在 `src/lib/`；Prompt 在根目录 `prompt1-3.md`。

## 7. Bad Cases 与解决
- 背景图跨域导致导出失败：增加本地图片代理与导出前内联背景，消除 CORS 污染。
- LLM 返回半结构化或混入 Markdown：添加 `tryParseJson` 及 fenced 处理，布局再经 zod 校验兜底。
- 文本编辑在缩放画布下易偏移：编辑浮层按 `canvasScale` 逆向缩放，保证鼠标及排版体验一致。
- Prompt被截断：prompt的值使用反引号包含，但是prompt里还有其他反引号，于是被代码截断，浪费了很多时间。
- 字体与色板不一致：布局解析时提供默认字体、色板及位置，避免前端渲染异常。

## 8. 模型评价
- Doubao 1.8 ：优点是 JSON 遵从度高；缺点是排版结构有时遗漏字段、生成速度慢。
- Seedream 4.5：中文场景及留白控制表现好，曝光与纹理细腻；缺点是 Prompt 负向约束遵从性不够高。

## 9. 商业价值与扩展
- 典型场景：小红书及电商商品卡片批量生成、活动海报即时出图、内容运营 A/B 测试。
- 变现潜力：SaaS 团队套餐、私有化部署、代运营、技术咨询。
- 未来工作：
  - 工程：扩展到电商海报、详情页领域。
  - 体验：优化UI/UX。
