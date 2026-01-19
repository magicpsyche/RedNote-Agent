export function AppHeader() {
  return (
    <header className="mb-6 flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">RedNote-Agent</p>
          <h1 className="text-2xl font-semibold leading-tight">
            小红书智能封面 & 文案生成器
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        </div>
      </div>
    </header>
  );
}
