"use client";

import { useState } from "react";

/** Campaign OG thumbnail with a branded fallback for the pre-launch/no-render case. */
export function CampaignThumb({ src, theme }: { src: string; theme: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="carbon flex h-full w-full items-center justify-center">
        <span className="pit-label border border-line px-3 py-1.5 text-muted">{theme} — pending render</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="h-full w-full object-cover opacity-90 grayscale-[15%] transition group-hover:opacity-100 group-hover:grayscale-0"
    />
  );
}
