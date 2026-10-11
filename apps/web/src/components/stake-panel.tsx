"use client";

import { useActionState, useState, useTransition } from "react";
import { depositStakeFormAction, submitProofAction, cancelCampaignAction } from "@/app/actions";
import { formatMoney } from "@bodytag/shared";

export function StakePanel({
  campaignId,
  held,
  min,
  gmv,
  fee,
  status,
  feeBps,
  requireStake,
}: {
  campaignId: string;
  held: number;
  min: number;
  gmv: number;
  fee: number;
  status: string;
  feeBps: number;
  requireStake: boolean;
}) {
  const [pending, start] = useTransition();
  const [depositState, depositAction, depositing] = useActionState(depositStakeFormAction, {} as { ok?: boolean; error?: string });
  const [notice, setNotice] = useState<string | null>(null);
  const finished = status === "closed" || status === "fulfilled";
  const feePct = `${feeBps / 100}%`;
  return (
    <section className="border border-line bg-panel p-5">
      <h2 className="text-2xl">Stake</h2>
      <p className="mt-2 text-sm text-muted">
        Prepaid hosted-service margin — not escrow of brand funds.{" "}
        {feeBps > 0
          ? `Hosting captures ${feePct} of winning GMV from this Stake after event proof and refunds the rest.`
          : "This instance charges no hosting fee, so Stake is optional and is refunded in full."}{" "}
        Arena and image generation stay $0.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-sm">
        <div>
          Held
          <div className="text-xl text-paper">{formatMoney(held)}</div>
        </div>
        <div>
          Min to publish
          <div className="text-xl text-paper">{requireStake ? formatMoney(min) : "Not required"}</div>
        </div>
        <div>
          Winning GMV
          <div className="text-xl text-paper">{formatMoney(gmv)}</div>
        </div>
        <div>
          Accrued fee ({feePct})
          <div className="text-xl text-accent">{formatMoney(fee)}</div>
        </div>
      </dl>
      {!finished && (
        <form action={depositAction} className="mt-4 flex flex-wrap items-center gap-2">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input name="amount" type="number" min="1" step="1" defaultValue="50" aria-label="Stake amount in USD" className="w-28 bg-ink p-2" />
          <button disabled={depositing} className="bg-accent px-4 py-2 text-ink disabled:opacity-60">
            {depositing ? "Adding…" : "Top up Stake"}
          </button>
          {depositState.error && <span className="text-sm text-signal">{depositState.error}</span>}
          {depositState.ok && !depositing && <span className="text-sm text-accent">Stake topped up.</span>}
        </form>
      )}
      {finished ? (
        <p className="mt-4 text-sm text-muted">
          This campaign is {status === "fulfilled" ? "fulfilled" : "closed"}; Stake has been settled.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {(status === "live" || status === "paused") && (
            <button
              type="button"
              disabled={pending}
              className="border border-line px-3 py-2 disabled:opacity-60"
              onClick={() => {
                if (!confirm("Submit event proof and close this campaign? Bidding ends and the Stake is settled.")) return;
                start(async () => {
                  const res = await submitProofAction(campaignId, "proof/demo.jpg");
                  if (res && "error" in res && res.error) setNotice(res.error);
                  else window.location.reload();
                });
              }}
            >
              Upload event proof (demo)
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            className="border border-signal px-3 py-2 text-signal disabled:opacity-60"
            onClick={() => {
              if (!confirm("Cancel this campaign? Sponsors are credited back and the Stake is refunded. This cannot be undone.")) return;
              start(async () => {
                const res = await cancelCampaignAction(campaignId);
                if (res && "error" in res && res.error) setNotice(res.error);
                else window.location.reload();
              });
            }}
          >
            Cancel campaign (full Stake refund)
          </button>
          {notice && <span className="text-signal">{notice}</span>}
        </div>
      )}
    </section>
  );
}
