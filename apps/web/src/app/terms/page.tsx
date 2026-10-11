import { LegalH2, LegalOperator, LegalShell } from "@/components/legal-shell";
import { appConfig } from "@/lib/config";

const unset = (what: string, env: string) => `[${what}: set ${env}]`;

export default function TermsPage() {
  const { legal } = appConfig;
  return (
    <LegalShell title="Terms">
      <LegalOperator />

      <LegalH2>1. What BodyTag is</LegalH2>
      <p>
        BodyTag is software for selling numbered digital advertising placements on a creator’s campaign page. On the
        official hosted instance, BodyTag is the host and the software provider. The creator is the seller of the
        advertising placement and the person who performs the campaign. Anyone who self-hosts BodyTag is the host on their own
        domain and must publish their own terms.
      </p>

      <LegalH2>2. Who may use it</LegalH2>
      <p>
        You must be at least 18 and able to enter a binding contract. Placements are sold to businesses and professionals for
        promotional use; by buying you confirm you are acting for business purposes and not as a consumer. Nothing in these
        Terms limits a right you have under mandatory consumer law that cannot be waived. You may not use BodyTag if you are
        subject to sanctions, or located in a country or territory our payment partners do not serve.
      </p>

      <LegalH2>3. What a brand buys</LegalH2>
      <p>
        You are buying advertising: your logo, tagline, link, optional QR code and live view counts on the campaign URL for the
        slot you hold. You are not buying an official event ticket, an endorsement, a share in any prize or pool, or funding for
        a trip. A takeover is a new purchase that replaces the previous placement and credits the previous holder; it is a
        buyout, not a game of chance.
      </p>
      <p>
        Physical wear (a temporary tattoo, a garment, walking the event) is an obligation the creator owes under these Terms. It
        is not a product resold by a payment processor, and BodyTag does not guarantee reach, press, attendance, or that a venue
        will allow a logo.
      </p>

      <LegalH2>4. Takeovers and pricing</LegalH2>
      <p>
        A slot can be taken over at 2× the current price. The price you see when you open checkout must still be the current
        price when payment completes. If another brand wins first, your payment is credited under the Refund policy rather than
        placed. Prices are shown in the campaign’s currency; the checkout may show your local currency and payment methods
        depending on your location and device.
      </p>

      <LegalH2>5. Payments and taxes</LegalH2>
      <p>
        Brand payments are collected by the creator’s payment processor (on the hosted instance, Dodo Payments or Stripe). Where
        Dodo Payments acts as merchant of record it calculates, collects and remits applicable sales tax, VAT or GST and issues the
        receipt. Where a creator uses a processor that is not a merchant of record, the creator is responsible for those taxes.
        Brands are responsible for any tax they must self-assess, such as reverse-charge VAT, and creators for taxes on what they
        earn. BodyTag never sees full card numbers.
      </p>

      <LegalH2>6. Creator obligations</LegalH2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Perform the campaign as described, show every sold placement as sold, and tell brands promptly if you cannot attend.</li>
        <li>Follow venue rules and local law on dress, public conduct, filming and event access.</li>
        <li>
          Disclose sponsorships in your own posts as the rules where you live or where your audience is require (for example FTC
          endorsement rules in the US, ASCI guidelines in India, EU and national advertising codes).
        </li>
        <li>
          In the UAE, hold the Advertiser Permit that the UAE Media Council requires for promotional content, and show the permit
          number where required.
        </li>
        <li>Use only your own likeness, or that of a person who has given you written consent, when creating an avatar.</li>
        <li>Review sponsor creatives and remove any that break the Content policy.</li>
      </ul>

      <LegalH2>7. Brand obligations</LegalH2>
      <p>
        You confirm that you own or license every mark, logo and claim you submit, that it is accurate and lawful where it will be
        displayed, and that it follows the Content policy. You will defend and indemnify BodyTag and the creator against third-party
        claims arising from your creative. You grant BodyTag and the creator a licence to display it on the campaign page and in
        generated images (social cards, print files) for the life of the campaign and any archive of it.
      </p>

      <LegalH2>8. Reports, moderation and takedowns</LegalH2>
      <p>
        Anyone can report a campaign or creative from the campaign page or by writing to {appConfig.supportEmail}. We may pause a
        live URL without deleting it so evidence is preserved, remove content that breaks the Content policy or the law, and
        suspend accounts. When we restrict content or an account we tell the affected person what we did and why, and how to
        challenge it, unless the law stops us. Copyright and trademark notices should identify the work, the page and the
        sender’s authority, and go to {appConfig.supportEmail}. Repeat infringers lose access.
      </p>

      <LegalH2>9. Hosted Stake addendum ({appConfig.hostedFeeBps / 100}% of winning GMV)</LegalH2>
      <p>
        On the hosted instance a creator deposits a Stake before going live. The Stake is the creator’s own prepaid credit for
        BodyTag’s hosted software. It exists only to cover our fee, which is {appConfig.hostedFeeBps / 100}% of the winning value of the campaign
        (the price of the placements that held their slots at close). If the Stake no longer covers the fee on current sales plus
        the next takeover, the campaign pauses until it is topped up. At close, after the creator uploads proof of the event, we
        take the fee from the Stake and return the rest. If the campaign is cancelled and brands are refunded, winning value is
        treated as zero. A non-refundable processor fee on the Stake payment itself may be deducted.
      </p>
      <p>
        The Stake is not escrow, a deposit held for brands, or security for the creator’s obligations to brands, and it is never
        used to pay a brand’s refund. We do not charge extra for arena hosting or image generation. Self-hosted instances charge
        no fee and need no Stake.
      </p>

      <LegalH2>10. Suspension and ending</LegalH2>
      <p>
        You can stop using BodyTag at any time. We may suspend or end access for a breach of these Terms, risk to others, or legal
        reasons, and will give notice and reasons where we can. Credits and any Stake owed to you are settled under the Refund
        policy, except where law requires us to withhold them.
      </p>

      <LegalH2>11. Liability</LegalH2>
      <p>
        The service is provided as is, without a promise of uninterrupted availability or results. To the extent the law allows,
        BodyTag’s total liability to you is capped at the amount you paid us in the 12 months before the claim (for a brand, the
        price of the affected placement), and we are not liable for indirect or lost-profit losses. Nothing here limits liability
        that cannot be limited by law, including for fraud, gross negligence, death or personal injury.
      </p>

      <LegalH2>12. Changes</LegalH2>
      <p>
        We may update these Terms. We will give at least 15 days’ notice of material changes to account holders by email or in the
        dashboard, except where a change is required sooner by law or to stop abuse. Using the service after the notice period
        means you accept the change; you may close your account instead.
      </p>

      <LegalH2>13. Governing law and disputes</LegalH2>
      <p>
        These Terms are governed by the laws of {legal.governingLaw || unset("governing law", "LEGAL_GOVERNING_LAW")}, and the
        courts there have jurisdiction, without removing any right you have to bring a claim in your own country where mandatory
        law gives you one. Please write to {appConfig.supportEmail} first so we can try to resolve a problem informally.
      </p>

      <LegalH2>14. Contact</LegalH2>
      <p>
        {appConfig.supportEmail} for support and legal notices; {legal.privacyEmail} for privacy. India grievance officer:{" "}
        {legal.grievanceOfficerName || unset("name", "GRIEVANCE_OFFICER_NAME")},{" "}
        {legal.grievanceOfficerEmail || unset("email", "GRIEVANCE_OFFICER_EMAIL")}.
      </p>
    </LegalShell>
  );
}
