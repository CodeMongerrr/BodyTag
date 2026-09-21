"use client";

import { useState } from "react";
import { createTicketAction } from "@/app/actions";

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <form
          className="mb-3 w-80 rounded-lg border border-line bg-panel p-4 shadow-2xl"
          action={async (fd) => {
            await createTicketAction(fd);
            setSent(true);
          }}
        >
          <p className="display text-lg">Need a human</p>
          <p className="mb-3 text-xs text-muted">
            Payment stuck: 4 business hours. Scam report: we pause in 1 hour. DMs get a ticket ID — we do not pay out over
            DMs.
          </p>
          {sent ? (
            <p className="text-accent">Ticket filed. We emailed the queue.</p>
          ) : (
            <>
              <label className="block text-xs text-muted">Kind</label>
              <select name="kind" className="mb-2 w-full bg-ink p-2 text-sm" defaultValue="payment">
                <option value="payment">Payment stuck / double charge</option>
                <option value="outbid">Outbid wallet credit missing</option>
                <option value="logo">Logo looks wrong</option>
                <option value="fake">This campaign is fake</option>
                <option value="general">Something else</option>
              </select>
              <input name="email" required type="email" placeholder="you@brand.com" className="mb-2 w-full bg-ink p-2 text-sm" />
              <input name="campaignId" placeholder="campaign id (optional)" className="mb-2 w-full bg-ink p-2 text-sm" />
              <input name="slotId" placeholder="slot id" className="mb-2 w-full bg-ink p-2 text-sm" />
              <input name="paymentId" placeholder="payment id" className="mb-2 w-full bg-ink p-2 text-sm" />
              <textarea name="body" required rows={3} placeholder="What happened" className="mb-2 w-full bg-ink p-2 text-sm" />
              <button className="w-full bg-accent py-2 text-sm font-medium text-ink">Open ticket</button>
            </>
          )}
        </form>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-ink shadow-lg"
      >
        {open ? "Close" : "Support"}
      </button>
    </div>
  );
}
