import { AppHeader } from "@/components/app-header";
import { InputSandbox } from "@/components/input-sandbox";
import { Workspace } from "@/components/workspace";

export default function Home() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <AppHeader />
        <InputSandbox />
        <Workspace />
      </div>
    </main>
  );
}
