export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="rounded-2xl bg-primary/10 p-4">
        <span className="text-4xl">🧠</span>
      </div>
      <h1 className="text-3xl font-bold tracking-tight">Med-Recallix</h1>
      <p className="max-w-md text-muted-foreground">
        医考记忆助手 — 基于 SM-2 间隔重复算法，帮你科学记忆、高效备考
      </p>
      <a
        href="/login"
        className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        开始学习
      </a>
    </main>
  );
}
