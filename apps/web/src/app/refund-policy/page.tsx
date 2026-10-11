import { LegalH2, LegalShell } from "@/components/legal-shell";
import { appConfig } from "@/lib/config";

export default function RefundPage() {
  return (
    <LegalShell title="Refund policy">
      <LegalH2>Brands</LegalH2>
      <p>
        <strong>No change-of-mind refunds.</strong> Placements are bought by businesses for promotional use, and delivery starts
        as soon as payment succeeds. Once your logo is live you cannot cancel for a refund because you changed your mind.
      </p>
      <p>
        <strong>Taken over.</strong> If another brand takes your slot at 2×, you receive a credit equal to the price you paid.
        The credit is a ledger entry on this BodyTag site, in the same currency. It applies automatically to your next purchase
        in that currency, cannot be transferred or exchanged for anything but a refund, earns no interest, and is refunded to
        your original payment method on request or if it has sat unused for 30 days. Card refunds are issued through the
        payment processor inside its refund window; if that window has closed we will agree another way to return the money.
        Processor fees on the original payment may not be returned unless the creator chooses to cover them.
      </p>
      <p>
        <strong>Creator cancels or cannot attend.</strong> The creator refunds you or offers equivalent content, and you choose.
        If the creator does not respond, write to {appConfig.supportEmail} and we will help you reach them.
      </p>
      <p>
        <strong>Removed for a policy breach.</strong> If a creative is removed because it breaks the Content policy, the
        purchase is not refunded, unless the removal was our error, in which case you get a full refund.
      </p>
      <p>
        <strong>Payment problems.</strong> If you were charged and your placement did not appear, or you were charged a different
        amount than the price shown, write to us with your receipt. We will fix it or refund you. Please contact us before
        asking your bank for a chargeback; we resolve most cases faster.
      </p>

      <LegalH2>Creators and Stake</LegalH2>
      <p>
        Unused Stake is returned to you after the campaign closes and any fee is taken. If the campaign is cancelled and brands
        are refunded, winning value is treated as zero and the Stake returns minus any non-refundable fee charged by the payment
        processor on the Stake payment. The {appConfig.hostedFeeBps / 100}% hosted software fee is the only BodyTag charge;
        arena hosting and image generation are not billed. Stake is never used to refund brands.
      </p>

      <LegalH2>Your legal rights</LegalH2>
      <p>
        This policy does not remove rights you have under mandatory law. If you buy as a consumer despite our business-only
        terms, or the law of your country gives you a cancellation right that cannot be waived, that right applies and we will
        honour it.
      </p>
    </LegalShell>
  );
}
