# 🏗️ RedNote-Agent 架构规范书

## 1. 项目概览 (Overview)

本项目是一个**无状态 (Stateless)、单页 (SPA)** 的 Next.js 应用。
**核心理念**：内存即数据库，浏览器即渲染器。
**流程**：用户输入（JSON/表单双模输入） -> 一键触发 AI 流水线（文案+视觉+生图+排版） -> 可视化微调（拖拽编辑） -> 预览与导出。

## 2. 技术栈清单 (Simplified Stack)

*   **Framework**: Next.js 14+ (App Router).
*   **State Management**: **Zustand** (核心！替代数据库，管理全局状态).
*   **UI Components**: Shadcn/UI + TailwindCSS + Lucide Icons.
*   **Editor**: Monaco Editor (JSON 输入).
*   **Canvas Interaction**: `react-draggable` (拖拽), `react-resizable` (选配).
*   **Export Engine**: `html-to-image`
*   **AI Backend**: Next.js Server Actions (隐藏 API Key, 串联 LLM 调用).

## 3. 数据流设计 (In-Memory Store)

没有数据库，所有数据存于 **Zustand Store**。

### 3.1. TypeScript Interfaces
查阅 @schema.md

## 4. 页面布局与功能模块

**路由**：仅 `/` (Home)。

### 4.1. 上半部分：Input Sandbox (高度约 40%)
*   **布局**：左右分栏或 Tabs 切换。
*   **功能**：
    *   **JSON Mode**：Monaco Editor，适合粘贴存量数据。
    *   **Form Mode**：Shadcn Form，适合人工填写。
    *   **Action Bar**：一个醒目的 "✨ Generate Magic" 按钮。点击触发 Server Action 链条，同时Input Sandbox折叠。

### 4.2. 下半部分：Workspace (高度约 60%)
*   **左侧：文案预览 (Copy Preview)**
    *   展示生成的 Title, Content, Tags。
    *   提供“复制文案”按钮。
    *   简单文本域可微调文案。
*   **右侧：封面编辑器 (Canvas Editor)**
    *   **容器**：一个固定比例 (3:4) 的 `div`，通过 CSS `transform: scale()` 适配屏幕。
    *   **底层**：`<img>` 标签，src 绑定 `visualData.backgroundUrl`。**锁定不可动**。
    *   **上层**：遍历 `visualData.layers`。
        *   使用 `<Draggable>` 包裹组件。
        *   双击文本图层可进入编辑模式 (contentEditable)。
    *   **工具栏**：位于 Canvas 上方，提供 "Add Text", "Export Image" 按钮。

### 4.3. 预览与导出 (Preview & Export)
*   **预览逻辑**：点击 Preview，弹出 Modal。
    *   Modal 内部模拟小红书 App 界面（顶部状态栏、底部互动栏），中间展示当前的 Canvas 和文案。
*   **导出逻辑**：
    *   用户点击 "Export Cover"。
    *   调用 `html-to-image(document.getElementById('canvas-container'))`。
    *   将生成的 Blob 转为 PNG 下载。
    *   **无需**上传服务器，直接在浏览器完成。

## 5. AI 流水线 (Server Actions)

为了响应速度，建议将长流程拆分为流式反馈，或者分步执行，但用户端表现为“一键”。

**API 路由**: `src/app/actions/generate.ts`

1.  **Step 1: Copywriting (LLM)**
    *   Prompt: 根据输入生成小红书文案 JSON。
2.  **Step 2: Visual Prompting (LLM)**
    *   Prompt: 根据文案生成生图提示词 (`seedream_prompt`) 和 排版建议。
3.  **Step 3: Image Generation (Native Fetch)**
    *   调用 `bytedance/doubao-seedream-4.5`。
    *   参数: `watermark: false`。
    *   返回: `image_url`。
4.  **Step 4: Layout Generation (LLM)**
    *   Prompt: 根据图片 URL或之前的排版建议，生成前端 `layers` JSON (CSS styles)。


## 6. 开发路线图 (Streamlined Roadmap)

请指示 Agent 按此顺序开发：

**Phase 1: 骨架搭建**
1.  初始化 Next.js，安装 Tailwind, Zustand, Lucide, `react-draggable`, `html-to-image`。
2.  构建单页布局：Header + Input区域 + Split View区域。
3.  建立 Zustand Store，定义数据结构。

**Phase 2: AI 连接 (The Brain)**
1.  配置 `.env` (API Keys, Base URL)。
2.  编写 `generateAll` Server Action。
    *   先跑通“输入 -> LLM文案”流程。
    *   再接入“文案 -> Seedream 生图”流程。
    *   最后接入“排版 JSON”生成。

**Phase 3: 编辑器核心 (The Hand)**
1.  实现 Canvas 组件：背景图加载。
2.  实现 Layer 组件：渲染文字/形状，支持拖拽 (`react-draggable`)。
3.  实现双击编辑文字内容功能。

**Phase 4: 交付与导出**
1.  实现“预览 Modal” (模拟小红书 UI)。
2.  实现 `html-to-image` 截图下载功能。
3.  UI 美化与细节调整 (Loading 状态, 错误处理)。