import { LegalShell } from "@/components/legal-shell";

export default function RefundPage() {
  return (
    <LegalShell title="Refund policy">
      <p>
        <strong>Brands.</strong> No mind-change refunds after a slot is purchased. If you are taken over at 2×, you receive
        a 100% credit to your BodyTag wallet on that creator&apos;s processor (wallet-first). Card refunds happen on withdraw
        or after 30 days idle, inside the processor window. Gateway fees on the original capture may stay with the processor
        unless the creator absorbs them.
      </p>
      <p>
        If the creator cancels the event or cannot attend, the creator refunds or offers equivalent content — you choose.
        Content-policy violations are forfeit.
      </p>
      <p>
        <strong>Creators / Stake.</strong> Unused Stake is refunded after close. If the campaign is cancelled and brands are
        refunded, winning GMV is treated as zero and the Stake returns minus any non-refundable Stake payment-processor fee.
        The 1% hosted software margin is the only BodyTag cut. Arena and image generation are not billed.
      </p>
    </LegalShell>
  );
}
