import { APP_VERSION } from "@reactify/shared";
import { Button } from "@reactify/ui";

export function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-50">
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-4 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-4 py-1 text-sm font-medium text-indigo-200">
          Foundation v{APP_VERSION}
        </p>
        <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl">
          Reactify
        </h1>
        <p className="mb-10 max-w-2xl text-lg leading-relaxed text-slate-300">
          Turn UI screenshots into production-ready React applications with a validated,
          AI-assisted workflow.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button variant="primary">Get Started</Button>
          <Button variant="secondary">View Docs</Button>
        </div>
        <p className="mt-12 text-sm text-slate-400">
          Monorepo initialized. Upload, generation, and preview features arrive in upcoming
          foundation tasks.
        </p>
      </main>
    </div>
  );
}
