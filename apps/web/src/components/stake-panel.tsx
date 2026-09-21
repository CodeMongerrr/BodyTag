"use client";

import { useTransition } from "react";
import { depositStakeFormAction, submitProofAction, cancelCampaignAction } from "@/app/actions";
import { formatMoney } from "@bodytag/shared";
import { appConfigClient } from "@/lib/config-client";

export function StakePanel({
  campaignId,
  held,
  min,
  gmv,
  fee,
  status,
}: {
  campaignId: string;
  held: number;
  min: number;
  gmv: number;
  fee: number;
  status: string;
}) {
  const [pending, start] = useTransition();
  return (
    <section className="border border-line bg-panel p-5">
      <h2 className="text-2xl">Stake</h2>
      <p className="mt-2 text-sm text-muted">
        Prepaid hosted-service margin — not escrow of brand funds. Official hosting captures 1% of winning GMV from this
        Stake after event proof and refunds the rest. Arena and image generation stay $0.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-sm">
        <div>
          Held
          <div className="text-xl text-paper">{formatMoney(held)}</div>
        </div>
        <div>
          Min to publish
          <div className="text-xl text-paper">{formatMoney(min)}</div>
        </div>
        <div>
          Winning GMV
          <div className="text-xl text-paper">{formatMoney(gmv)}</div>
        </div>
        <div>
          Accrued 1%
          <div className="text-xl text-accent">{formatMoney(fee)}</div>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted">
        Hosted bps shown in UI: set HOSTED_FEE_BPS on the server ({appConfigClient.note})
      </p>
      <form action={depositStakeFormAction} className="mt-4 flex gap-2">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input name="amount" type="number" min="1" step="1" defaultValue="50" className="w-28 bg-ink p-2" />
        <button className="bg-accent px-4 py-2 text-ink">Top up Stake</button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          disabled={pending || status === "fulfilled"}
          className="border border-line px-3 py-2"
          onClick={() =>
            start(async () => {
              await submitProofAction(campaignId, "proof/demo.jpg");
              window.location.reload();
            })
          }
        >
          Upload event proof (demo)
        </button>
        <button
          type="button"
          className="border border-signal px-3 py-2 text-signal"
          onClick={() =>
            start(async () => {
              await cancelCampaignAction(campaignId);
              window.location.reload();
            })
          }
        >
          Cancel campaign (full Stake refund)
        </button>
      </div>
    </section>
  );
}
