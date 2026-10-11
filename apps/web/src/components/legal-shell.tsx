import type { ReactNode } from "react";
import { appConfig } from "@/lib/config";

export function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-4xl md:text-5xl">{title}</h1>
      <div className="pit-stripe mt-6 w-24" />
      <p className="mt-3 text-xs text-muted">Version {appConfig.legal.termsVersion}</p>
      <article className="prose-legal mt-8 space-y-4 text-sm leading-7 text-paper/90">{children}</article>
    </main>
  );
}

export function LegalH2({ children }: { children: ReactNode }) {
  return <h2 className="display pt-4 text-2xl text-paper">{children}</h2>;
}

const unset = (what: string, env: string) => `[${what}: set ${env}]`;

/** Operator identity. Unset values render as visible placeholders so an unfinished deployment cannot pass for a finished one. */
export function LegalOperator() {
  const l = appConfig.legal;
  return (
    <p className="border border-line bg-panel p-4 text-xs leading-6 text-muted">
      Operator of this site: {l.entityName || unset("legal entity name", "LEGAL_ENTITY_NAME")},{" "}
      {l.entityAddress || unset("registered address", "LEGAL_ENTITY_ADDRESS")}. Support: {appConfig.supportEmail}. Privacy:{" "}
      {l.privacyEmail}.
    </p>
  );
}
