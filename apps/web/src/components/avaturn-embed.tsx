"use client";

import { useEffect, useState } from "react";
import type { AvaturnSDK, ExportAvatarResult } from "@avaturn/sdk";
import { appConfigClient } from "@/lib/config-client";

export type { ExportAvatarResult };

/**
 * Avaturn editor iframe. Free tier: the creator signs in to Avaturn inside the iframe,
 * scans their face (front + two sides) with the camera, picks a body/outfit, presses Next.
 * Only the `export` and `error` callbacks fire on free-tier sessions.
 */
export function AvaturnEmbed({
  onExport,
  onError,
  subdomain = appConfigClient.avaturnSubdomain,
  className = "relative h-[min(80vh,760px)] min-h-[520px] w-full border border-line bg-ink",
}: {
  onExport: (result: ExportAvatarResult) => void;
  onError?: (err: { type: string; message?: string }) => void;
  subdomain?: string;
  className?: string;
}) {
  // Callback ref via state so the effect runs once the container exists (mirrors Avaturn's React example).
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!container) return;
    let sdk: AvaturnSDK | null = null;
    let cancelled = false;

    // The SDK listens for postMessage from any origin. Drop SDK-shaped messages that did not come from Avaturn
    // before its own listener sees them (capture phase, registered first), so a rogue window cannot fake an export.
    const guard = (e: MessageEvent) => {
      const src = (e.data as { source?: unknown } | null)?.source;
      if (src !== "v1.avaturn-sdk-server") return;
      let host = "";
      try {
        host = new URL(e.origin).hostname;
      } catch {
        /* opaque origin */
      }
      if (!(host.endsWith(".avaturn.dev") || host.endsWith(".avaturn.me"))) e.stopImmediatePropagation();
    };
    window.addEventListener("message", guard, true);

    // The SDK's init only resolves on an iframe handshake and has no timeout of its own.
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      setStatus((s) => (s === "loading" ? "error" : s));
      onError?.({ type: "init_timeout", message: `Avaturn did not respond from ${subdomain}.avaturn.dev` });
    }, 25_000);

    // The SDK touches window/postMessage at import time; keep it out of the server bundle.
    import("@avaturn/sdk")
      .then(({ AvaturnSDK }) => {
        if (cancelled) return;
        sdk = new AvaturnSDK();
        // Register before init: the SDK can report auth/scene errors before the handshake completes.
        sdk
          .on("export", (data) => onExport(data))
          .on("error", (err) => {
            setStatus("error");
            onError?.(err);
          });
        return sdk
          .init(container, {
            url: `https://${subdomain}.avaturn.dev`,
            iframeClassName: "avaturn-iframe",
          })
          .then(() => {
            if (cancelled) return;
            window.clearTimeout(timeout);
            setStatus("ready");
          });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        window.clearTimeout(timeout);
        setStatus("error");
        onError?.({ type: "init_error", message: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("message", guard, true);
      // Required under React StrictMode double-mount: the SDK keys its iframe by a fixed id.
      sdk?.destroy();
    };
    // onExport/onError are intentionally not deps: re-initialising the iframe on every render would drop the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, subdomain]);

  return (
    <div ref={setContainer} className={className} data-avaturn={status}>
      {status === "loading" && (
        <p className="pointer-events-none absolute left-3 top-3 z-10 bg-ink/80 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-accent">
          Loading Avaturn…
        </p>
      )}
    </div>
  );
}
