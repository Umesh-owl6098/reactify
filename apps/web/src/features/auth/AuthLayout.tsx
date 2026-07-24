import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-50">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <div className="mb-8 text-center">
          <Link to="/" className="text-sm font-medium text-indigo-300 hover:text-indigo-200">
            Reactify
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-slate-300">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">{children}</div>
      </main>
    </div>
  );
}
