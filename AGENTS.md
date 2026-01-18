# Repository Guidelines

## 工作语言
- 思考语言可以按你的喜好。
- 与用户沟通的语言必须使用中文。

## 🛠️ 能力调用 (Skills & Capabilities)
- **Frontend Design (`$frontend-design`)**：
  - **触发时机**：当任务涉及 UI 组件开发、Tailwind 样式编写、复杂布局（如三列编辑器）、动画交互或 Canvas 渲染逻辑时，**必须主动调用 `$frontend-design`**。
  - **应用场景**：
    1. **组件开发**：编写复用组件（如 Shadcn UI 扩展）。
    2. **布局实现**：实现流式布局、响应式设计及 Grid/Flex 系统。
    3. **交互逻辑**：集成拖拽交互及可视化编辑器逻辑。
    4. **合成渲染**：编写生成“合成层” HTML/CSS 代码的 Prompt 或逻辑时，利用该能力确保视觉美感与代码规范。

## Project Structure & Module Organization
- `src/app/`: App Router entrypoint; keeps `page.tsx`, server actions, and route handlers. Keep the SPA flow under `/`.
- `src/components/`: Reusable UI (shadcn/ui wrappers, canvas/editor widgets, form inputs). Name components with `PascalCase`.
- `src/store/`: Zustand store slices; holds `AppStatus`, `copyResult`, `visualStrategy`, and `layoutConfig`.
- `src/types/schema.ts`: Source of truth for `ProductInput`, `CopyResult`, `VisualStrategy`, `LayoutConfig`, and `AppStatus` (see `schema.md`).
- `src/lib/`: Utilities (LLM clients, html-to-image helpers, fetch wrappers).
- `public/`: Static assets and fonts; keep large demo images out of the repo.
- `tests/` or `__tests__/`: Component and server action tests; mirror `src` structure.

## Build, Test, and Development Commands
- `pnpm install`: Install dependencies (preferred manager); `npm` works if pnpm is unavailable.
- `pnpm dev`: Run Next.js locally with hot reload at http://localhost:3000.
- `pnpm lint`: ESLint + TypeScript checks for both client and server code.
- `pnpm test`: Run unit/integration tests (React Testing Library/Vitest or Jest).
- `pnpm build`: Production build; surfaces server action and route issues.

## Canvas Resolution & Export
- Seedream 返回底图为 `2304x3072`；编辑器展示时按比例缩放整个画布容器（可用父级 `transform: scale()` 或限制容器宽度），但逻辑坐标保持 3:4 比例。
- 布局数据仍以 `1080x1440` 为逻辑尺寸存储；将百分比定位用于文字/贴纸，确保缩放时元素等比例跟随。
- 导出时用 `html-to-image` 生成 `1080x1440`：先将画布容器临时设置为逻辑尺寸再截取，确保文字/装饰按缩放后比例输出。

## Coding Style & Naming Conventions
- TypeScript-first; enable `strict` in `tsconfig`.
- Prettier defaults (2-space indent, single quotes, semicolons); run on save or before commit.
- Components/files: `PascalCase` for React components, `camelCase` for functions/vars, `kebab-case` for files (except React components).
- Keep server actions in `src/app/actions/*.ts`; avoid client-only APIs inside actions.
- Favor functional components, hooks, and composition; keep Zustand selectors memoized.

## Testing Guidelines
- Prefer integration-style tests with React Testing Library; mock network/LLM calls at the fetch layer.
- Name tests after the module under test (e.g., `input-sandbox.test.tsx` next to the component).
- Aim for coverage on critical flows: input parsing, store transitions, server action branching, and canvas layer serialization.
- For async server actions, assert status transitions: `IDLE -> GENERATING_* -> COMPLETED/FAILED`.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`) to keep history skimmable.
- PRs should include: clear summary, before/after notes for UI, linked issue/task, and screenshots or GIFs for visual changes.
- Keep PRs small and scoped; ensure `pnpm lint` and `pnpm test` pass locally before request for review.
- When adding prompts or schemas, reference the corresponding section in `spec.md` or `schema.md` within the PR description.

## Security & Configuration
- Copy `.env.example` to `.env`; never commit secrets. Store API keys for Seedream/LLM only in env vars used by server actions.
- Do not log prompts or keys in client bundles; keep all AI calls in server actions under `src/app/actions/`.
