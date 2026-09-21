import type { ReactNode } from "react";

export function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-4xl md:text-5xl">{title}</h1>
      <div className="pit-stripe mt-6 w-24" />
      <article className="prose-legal mt-8 space-y-4 text-sm leading-7 text-paper/90">{children}</article>
    </main>
  );
}
