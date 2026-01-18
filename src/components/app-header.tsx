export function AppHeader() {
  return (
    <header className="mb-6 flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">RedNote-Agent</p>
          <h1 className="text-2xl font-semibold leading-tight">
            小红书智能封面 & 文案生成器
          </h1>
          <p className="text-sm text-muted-foreground">
            Next.js 16 + App Router · 状态存储在 Zustand（无数据库）
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
            Seedream 底图：2304×3072
          </span>
          <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
            画布逻辑尺寸：1080×1440（3:4）
          </span>
          <span className="rounded-full bg-accent px-3 py-1 text-accent-foreground">
            导出：1080×1440
          </span>
        </div>
      </div>
    </header>
  );
}
