"use client";

import { useEffect, useState } from "react";

export default function ManagePage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState("");
  const load = async (t: string) => {
    const clean = t.trim();
    if (!clean) return;
    setMsg("");
    try {
      const res = await fetch(`/api/manage?token=${encodeURIComponent(clean)}`);
      const json = (await res.json()) as Record<string, unknown>;
      setData(res.ok ? json : { error: "invalid" });
    } catch {
      setData({ error: "network" });
    }
  };
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (t) {
      setToken(t);
      void load(t);
    }
  }, []);
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-4xl">Sponsor portal</h1>
      <p className="mt-2 text-sm text-muted">
        Magic link from the payment email. Update logo and tagline without another charge. Only the current slot owner can
        write.
      </p>
      <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Magic token" aria-label="Magic token" className="mt-6 w-full bg-panel p-3" />
      <button
        className="mt-2 border border-line px-3 py-2"
        onClick={() => load(token)}
      >
        Load
      </button>
      {data && "error" in data && (
        <p className="mt-4 text-signal">
          {data.error === "network" ? "Could not reach the server. Try again." : "That magic token wasn't recognised. Check the link in your payment email."}
        </p>
      )}
      {data && !("error" in data) && (
        <form
          className="mt-6 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("token", token);
            const res = await fetch("/api/manage", { method: "POST", body: fd });
            const out = (await res.json().catch(() => ({}))) as { error?: string };
            setMsg(res.ok ? "Saved. Logo will refresh on the live URL." : out.error === "not current owner" ? "Only the current slot owner can edit this." : (out.error ?? "Could not save"));
          }}
        >
          <p className="text-sm">
            {String(data.brandName)} on {String(data.slot)} ({String(data.status)})
          </p>
          <input name="tagline" placeholder="Tagline" className="w-full bg-ink p-2" />
          <input name="url" placeholder="https://" className="w-full bg-ink p-2" />
          <input name="xHandle" placeholder="@handle" className="w-full bg-ink p-2" />
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
          <button className="bg-accent px-4 py-2 text-ink">Update creative</button>
          {msg && <p className="text-accent">{msg}</p>}
        </form>
      )}
    </main>
  );
}
