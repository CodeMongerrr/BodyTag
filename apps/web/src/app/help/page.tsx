import Link from "next/link";

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-5xl">Help center</h1>
      <p className="mt-4 text-muted">Two desks: creators (merchants) and brands (bidders). We do not run payouts over DMs.</p>
      <section className="mt-10 space-y-6 text-sm leading-7">
        <h2 className="text-2xl">How bidding works</h2>
        <p>
          Click a numbered slot. Pay the listed price on the creator&apos;s checkout (overlay on the live URL). You own that
          advertising placement until someone pays 2×. The previous owner is credited to a wallet — we do not card-refund
          every takeover. This is a purchase / takeover / refund, never a bet.
        </p>
        <h2 className="text-2xl">When the logo goes live</h2>
        <p>
          On payment.succeeded (or a successful wallet debit). Overlay return is not enough. OG, square, and story images
          regenerate on a worker so tweets pick up the new composite.
        </p>
        <h2 className="text-2xl">Refund timing</h2>
        <p>
          Outbid: wallet credit immediately. Withdrawal to card: within the processor window (Dodo 30 days). Event cancelled:
          the creator refunds on their processor. Content-policy violations are forfeit.
        </p>
        <h2 className="text-2xl">Stake (hosted only)</h2>
        <p>
          Stake is prepaid hosted-service margin, not escrow of brand money. After event proof we capture 1% of winning GMV
          from Stake and refund the rest. No extra charge for the arena or image generation. If Stake cannot cover 1% of GMV
          plus the next takeover, bidding pauses — the URL stays up.
        </p>
        <h2 className="text-2xl">Print pack</h2>
        <p>After close, download a zip of logos plus a placement diagram from the campaign dashboard. We do not ship tattoos.</p>
        <h2 className="text-2xl">Event cancelled</h2>
        <p>Creator refunds brands. Hosted Stake returns in full (GMV = 0) minus any non-refundable Stake processor fee.</p>
        <h2 className="text-2xl">Ticket macros</h2>
        <ul className="list-disc pl-5">
          <li>Payment stuck: confirm on payment.succeeded only; extra charges go to wallet.</li>
          <li>Outbid: wallet credit is the product, not a card refund loop.</li>
          <li>Fake campaign: pause bidding in 1 hour; URL stays up as evidence; decide in 24 hours.</li>
          <li>Logo: sponsor portal magic link; worker regenerates OG.</li>
        </ul>
        <h2 className="text-2xl">SLAs</h2>
        <ul className="list-disc pl-5">
          <li>Payment stuck / double charge: 4 business hours</li>
          <li>Outbid wallet credit missing: 4 hours</li>
          <li>KYC review: 1–2 business days</li>
          <li>Impersonation / scam report: 1 hour to pause, 24 hours to decide</li>
        </ul>
        <p>
          Email <a href="mailto:support@bodytag.app">support@bodytag.app</a> (brands) or{" "}
          <a href="mailto:creators@bodytag.app">creators@bodytag.app</a> (payouts/KYC). Status: <Link href="/status">/status</Link>.
        </p>
      </section>
    </main>
  );
}
