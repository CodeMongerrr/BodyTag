"use client";

import { useActionState } from "react";
import { kycFormAction, type KycState } from "@/app/actions";

export function KycForm({ phone, socialX, socialInstagram }: { phone: string; socialX: string; socialInstagram: string }) {
  const [state, action, pending] = useActionState<KycState, FormData>(kycFormAction, { ok: false });
  return (
    <form action={action} className="mt-8 space-y-3">
      <input name="phone" placeholder="Phone" defaultValue={phone} aria-label="Phone" className="w-full bg-panel p-3" />
      <input name="socialX" placeholder="X handle" defaultValue={socialX} aria-label="X handle" className="w-full bg-panel p-3" />
      <input name="socialInstagram" placeholder="Instagram" defaultValue={socialInstagram} aria-label="Instagram" className="w-full bg-panel p-3" />
      <label className="flex gap-2 text-sm">
        <input type="checkbox" name="idSelfie" /> I uploaded a government ID + selfie (demo auto-approves L2)
      </label>
      {state.error && <p className="text-sm text-signal">{state.error}</p>}
      {state.ok && !pending && <p className="text-sm text-accent">Saved. You are now Creator L{state.tier}.</p>}
      <button disabled={pending} className="bg-accent px-4 py-2 text-ink disabled:opacity-60">
        {pending ? "Checking…" : "Submit KYC"}
      </button>
    </form>
  );
}
