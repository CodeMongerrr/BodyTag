"use client";

import { useState } from "react";
import type { PublicCampaign } from "@/lib/campaigns";
import { bidAction } from "@/app/actions";
import { formatMoney } from "@bodytag/shared";

export function BidOverlay({
  campaign,
  slot,
  onClose,
  onSettled,
}: {
  campaign: PublicCampaign;
  slot: PublicCampaign["slots"][number];
  onClose: () => void;
  onSettled: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4" role="dialog" aria-modal>
      <form
        className="w-full max-w-md border border-line bg-panel p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          const form = e.currentTarget;
          const file = (form.elements.namedItem("logo") as HTMLInputElement).files?.[0];
          if (!file) {
            setError("Logo required (PNG/JPEG/WebP, 2 MB).");
            setPending(false);
            return;
          }
          const fd = new FormData();
          fd.set("file", file);
          fd.set("kind", "logo");
          const up = await fetch("/api/uploads", { method: "POST", body: fd }).then((r) => r.json());
          if (up.error) {
            setError(up.error);
            setPending(false);
            return;
          }
          const result = await bidAction({
            campaignId: campaign.id,
            slotId: slot.id,
            brandEmail: (form.elements.namedItem("email") as HTMLInputElement).value,
            brandName: (form.elements.namedItem("brand") as HTMLInputElement).value,
            tagline: (form.elements.namedItem("tagline") as HTMLInputElement).value,
            url: (form.elements.namedItem("url") as HTMLInputElement).value,
            xHandle: (form.elements.namedItem("x") as HTMLInputElement).value,
            logoKey: up.key,
            expectedPriceCents: slot.currentPriceCents,
          });
          setPending(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          if (result.settled) {
            onSettled();
            return;
          }
          if (result.checkoutUrl) {
            window.location.href = result.checkoutUrl;
          }
        }}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-2xl">Purchase {slot.name}</h2>
          <button type="button" onClick={onClose} className="text-muted">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          {formatMoney(slot.currentPriceCents, campaign.currency)} · overlay checkout stays on this live URL. This is a
          purchase, not a bet. Wallet covers takeovers first.
        </p>
        <label className="mt-4 block text-xs uppercase tracking-widest text-muted">Brand</label>
        <input name="brand" required className="w-full bg-ink p-2" />
        <label className="mt-3 block text-xs uppercase tracking-widest text-muted">Email</label>
        <input name="email" type="email" required className="w-full bg-ink p-2" />
        <label className="mt-3 block text-xs uppercase tracking-widest text-muted">Logo</label>
        <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
        <label className="mt-3 block text-xs uppercase tracking-widest text-muted">Tagline</label>
        <input name="tagline" className="w-full bg-ink p-2" />
        <label className="mt-3 block text-xs uppercase tracking-widest text-muted">Website</label>
        <input name="url" type="url" className="w-full bg-ink p-2" />
        <label className="mt-3 block text-xs uppercase tracking-widest text-muted">X handle</label>
        <input name="x" className="w-full bg-ink p-2" />
        {error && <p className="mt-3 text-signal">{error}</p>}
        <button disabled={pending} className="mt-5 w-full bg-accent py-3 font-medium text-ink">
          {pending ? "Working…" : `Pay ${formatMoney(slot.currentPriceCents)}`}
        </button>
      </form>
    </div>
  );
}
