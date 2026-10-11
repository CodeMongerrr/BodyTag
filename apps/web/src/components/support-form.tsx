"use client";

import { useActionState } from "react";
import { createTicketFormAction, type TicketState } from "@/app/actions";

export function SupportForm() {
  const [state, action, pending] = useActionState<TicketState, FormData>(createTicketFormAction, { ok: false });
  if (state.ok) {
    return <p className="mt-6 text-accent">Ticket filed. We&apos;ll reply to the email you gave us.</p>;
  }
  return (
    <form action={action} className="mt-6 space-y-3">
      <select name="kind" className="w-full bg-panel p-2" aria-label="Kind of problem">
        <option value="payment">Payment stuck</option>
        <option value="outbid">Wallet credit missing</option>
        <option value="logo">Logo</option>
        <option value="fake">Impersonation</option>
      </select>
      <input name="email" type="email" required placeholder="email" className="w-full bg-panel p-2" />
      <input name="campaignId" placeholder="campaign id" className="w-full bg-panel p-2" />
      <textarea name="body" required minLength={5} className="w-full bg-panel p-2" rows={5} aria-label="What happened" />
      {state.error && <p className="text-sm text-signal">{state.error}</p>}
      <button disabled={pending} className="bg-accent px-4 py-2 text-ink disabled:opacity-60">
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
