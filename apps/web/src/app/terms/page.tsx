import { LegalShell } from "@/components/legal-shell";
import { appConfig } from "@/lib/config";

export default function TermsPage() {
  return (
    <LegalShell title="Terms">
      <p>
        BodyTag is software for selling numbered digital advertising placements on a creator&apos;s campaign page. On the
        official hosted instance, BodyTag is the host. The creator is the performer and the seller of the advertising SKU.
        Self-host operators are the host on their own domain.
      </p>
      <p>
        You are buying advertising: logo, tagline, link, optional QR, and live views on the campaign URL. You are not buying
        an official event ticket, not entering a lottery, and not funding a trip. Takeover at 2× is a new purchase that
        cancels the previous placement with a credit/refund — a buyout, not a prize pool.
      </p>
      <p>
        Physical wear (tattoo, garment, walking the event) is an obligation of the creator under these Terms, not a product
        resold by a payment processor. BodyTag does not guarantee reach, press, or that a venue will allow a logo.
      </p>
      <h2 className="display text-2xl text-paper">Hosted Stake addendum ({appConfig.hostedFeeBps / 100}% GMV)</h2>
      <p>
        If you use official hosting, you deposit a Stake: prepaid hosted-service margin. After close and event proof we
        capture one percent of winning GMV from that Stake and refund the remainder. We do not charge extra for arena
        hosting or image generation. Stake is not escrow of brand bid funds. Brand money settles on the creator&apos;s
        processor. Self-host: fee 0%, Stake optional.
      </p>
      <p>
        Liability is capped at the amount you paid. Logo indemnity: the sponsor owns the mark and will defend claims.
        Creators review creatives and will pull infringing or policy-breaking logos. We may pause a live URL without taking
        it down so evidence remains.
      </p>
      <p>Governing copy for hosted: operator of bodytag.app. Self-host: replace with your entity.</p>
    </LegalShell>
  );
}
