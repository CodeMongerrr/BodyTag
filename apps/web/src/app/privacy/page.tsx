import { LegalShell } from "@/components/legal-shell";

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy">
      <p>
        We collect account email, handle, campaign content, bid emails, logos, and (on hosted) Stake ledger entries. Payment
        cards are handled by the creator&apos;s processor (Dodo, Stripe, Razorpay) — we do not store PAN or private keys.
      </p>
      <p>
        Live URLs show brand names, logos, and optional handles you submit. Viewer counts and a coarse country ticker may
        appear on the arena. We use cookies for sessions. SSE connections carry campaign ids, not card data.
      </p>
      <p>
        KYC documents (when you reach L2) go to Persona/Didit or the self-host operator. We keep chargeback evidence:
        timestamped page screenshots, webhook ids, emails.
      </p>
      <p>Contact privacy via creators@bodytag.app. Self-host operators are independent controllers of their database.</p>
    </LegalShell>
  );
}
