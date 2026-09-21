"use client";

import { useActionState } from "react";
import { loginStateAction, registerStateAction, type AuthState } from "@/app/actions";

export function AuthForm({ mode }: { mode: "in" | "up" }) {
  const action = mode === "up" ? registerStateAction : loginStateAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, { error: null });
  return (
    <form action={formAction} className="mx-auto mt-10 max-w-md border border-line bg-panel p-8">
      <h1 className="text-4xl">{mode === "up" ? "Create a floor" : "Sign in"}</h1>
      <p className="mt-2 text-sm text-muted">
        Demo: mara@demo.bodytag / demo1234. Creators connect their own checkout. BodyTag never holds brand bid money.
      </p>
      {mode === "up" && (
        <>
          <label className="mt-6 block text-xs uppercase tracking-widest text-muted">Name</label>
          <input name="name" required className="mt-1 w-full border border-line bg-ink p-3" />
          <label className="mt-4 block text-xs uppercase tracking-widest text-muted">Handle</label>
          <input name="handle" required pattern="[a-z0-9_]{3,24}" className="mt-1 w-full border border-line bg-ink p-3" />
        </>
      )}
      <label className="mt-4 block text-xs uppercase tracking-widest text-muted">Email</label>
      <input name="email" type="email" required className="mt-1 w-full border border-line bg-ink p-3" />
      <label className="mt-4 block text-xs uppercase tracking-widest text-muted">Password</label>
      <input name="password" type="password" required minLength={8} className="mt-1 w-full border border-line bg-ink p-3" />
      {state.error && <p className="mt-4 text-sm text-signal">{state.error}</p>}
      <button disabled={pending} className="mt-6 w-full bg-accent py-3 font-medium text-ink disabled:opacity-60">
        {pending ? "Working…" : mode === "up" ? "Open dashboard" : "Enter"}
      </button>
    </form>
  );
}