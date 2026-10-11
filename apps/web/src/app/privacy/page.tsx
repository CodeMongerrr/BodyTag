import { LegalH2, LegalOperator, LegalShell } from "@/components/legal-shell";
import { appConfig } from "@/lib/config";

const unset = (what: string, env: string) => `[${what}: set ${env}]`;

export default function PrivacyPage() {
  const { legal } = appConfig;
  return (
    <LegalShell title="Privacy">
      <LegalOperator />

      <LegalH2>Who is responsible</LegalH2>
      <p>
        The operator above decides why and how personal data is used on this site (the “controller”, “data fiduciary” or
        “business”, depending on where you live). Anyone who self-hosts BodyTag is an independent controller of their own
        database and must publish their own notice. Creators receive a brand’s name, logo, tagline, website and contact email so
        they can deliver the placement; they are responsible for how they use it.
      </p>

      <LegalH2>What we collect</LegalH2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Account:</strong> name, handle, email, a hashed password, and the time and version of the Terms you accepted.
          Creator verification adds a phone number and a public X or Instagram handle.
        </li>
        <li>
          <strong>Campaigns:</strong> event details, photos and 3D avatar files you upload, outfit and arena settings.
        </li>
        <li>
          <strong>Brand bids:</strong> brand name, email, logo, tagline, website, X handle, the bid amount, and a payment
          reference. We do not receive card numbers; the payment processor collects payment details, billing address and tax
          ID, and tells us the payment id, status, amount, currency and country.
        </li>
        <li>
          <strong>Stake and credit ledgers:</strong> deposits, fees, credits and refunds.
        </li>
        <li>
          <strong>Support and reports:</strong> what you send us, and the email you give.
        </li>
        <li>
          <strong>Technical:</strong> IP address, device and browser details, and request logs for security, rate limiting and
          abuse prevention; one session cookie; and a coarse country derived from the visit for the live ticker.
        </li>
        <li>
          <strong>Identity checks (when enabled):</strong> if a verification provider such as Persona or Didit is turned on, it
          collects your ID document and selfie and tells us only the result and tier. We do not keep the documents.
        </li>
      </ul>

      <LegalH2>Face-derived avatar data</LegalH2>
      <p>
        Creators can build a 3D avatar in the Avaturn editor embedded in the dashboard. Avaturn processes the photos you give it
        under its own terms and returns a 3D model file, which we store with the campaign and show publicly on the arena. That
        model reflects your face and body shape, so we treat it as sensitive: we ask for your explicit consent before you open
        the editor, use it only to display your campaign, never to identify you or anyone else, never sell it, and delete it when
        you remove it or ask us to. Do not upload another person’s likeness without their written consent.
      </p>

      <LegalH2>Why we use data, and our legal basis</LegalH2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Run accounts, campaigns, bids, credits and Stake: to perform our contract with you.</li>
        <li>Prevent fraud, abuse and chargebacks, keep evidence, secure the service: our legitimate interests.</li>
        <li>Keep tax, accounting and moderation records and answer lawful requests: legal obligation.</li>
        <li>Avatar and face-derived data, and any non-essential cookies we may add: your consent, which you can withdraw.</li>
      </ul>
      <p>
        In India we process on your consent and for the “legitimate uses” the DPDP Act allows, such as performing a contract you
        asked for. In the UAE we rely on consent, contract performance and the other grounds the Personal Data Protection Law
        permits. In the US we use data for the business purposes described here.
      </p>

      <LegalH2>Who we share it with</LegalH2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Payment processors: Dodo Payments (merchant of record) and Stripe, for the creator’s checkout and refunds.</li>
        <li>Hosting, storage and database providers (on the official instance, Cloudflare and Neon).</li>
        <li>Avaturn for avatar creation, and any identity verification provider you choose to use.</li>
        <li>The creator whose slot you buy, and the public, for what appears on the live page.</li>
        <li>Authorities, advisers and courts where the law requires it or to protect rights; and a successor if we are acquired.</li>
      </ul>
      <p>
        We do not sell personal information, we do not share it for cross-context behavioural advertising, and we run no
        advertising trackers. Live pages show brand names, logos, optional handles, viewer counts and a coarse country ticker to
        everyone who visits.
      </p>

      <LegalH2>International transfers</LegalH2>
      <p>
        Our providers may process data outside your country, including in the United States and India. Where the law requires,
        we rely on safeguards such as the EU Standard Contractual Clauses or an adequacy decision, and on the cross-border rules
        in the UAE and India.
      </p>

      <LegalH2>How long we keep it</LegalH2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Account data: while your account is open, plus up to 30 days after you ask us to delete it (backups up to 90 days).</li>
        <li>Campaign content and avatar files: until you delete them, and no longer than 12 months after the event closes.</li>
        <li>Bid, payment, credit and Stake records: up to 7 years, for tax, accounting and legal claims.</li>
        <li>Chargeback evidence (page captures, webhook ids, emails): up to 18 months after the payment.</li>
        <li>Support tickets and reports: up to 24 months after they are resolved.</li>
        <li>Server and security logs: up to 30 days.</li>
      </ul>

      <LegalH2>Your rights</LegalH2>
      <p>
        <strong>EU and UK:</strong> access, correction, deletion, restriction, portability, objection, and withdrawing consent,
        plus the right to complain to your data protection authority. <strong>India:</strong> access, correction, erasure,
        grievance redressal and nominating another person to act for you, with a complaint to the Data Protection Board after you
        have used our grievance process. <strong>UAE:</strong> access, correction, erasure, restriction, portability and
        objection under the PDPL, with a complaint to the UAE Data Office. <strong>US:</strong> where your state’s law applies
        (for example California, Colorado, Texas, Virginia), the right to know, delete, correct, and opt out of sale or sharing
        (we do neither), and to appeal a refusal; we will not discriminate against you for using these rights.
      </p>
      <p>
        To use any of them write to {legal.privacyEmail}. We may need to verify who you are, and we will answer within the time
        your law sets (generally 30 to 45 days).
      </p>

      <LegalH2>Cookies</LegalH2>
      <p>
        We set one strictly necessary cookie, <code>bt_session</code>, to keep you signed in for up to 14 days. It is HttpOnly and
        is not used for tracking. We use no analytics or advertising cookies. If we add any, we will ask for your consent first
        where the law requires it.
      </p>

      <LegalH2>Children</LegalH2>
      <p>
        BodyTag is for people 18 and over. We do not knowingly collect data from children, and will delete it if we learn we have.
      </p>

      <LegalH2>Security</LegalH2>
      <p>
        Passwords are hashed, traffic is encrypted in transit, payment webhooks are signature-checked, and access to data is
        limited. If a breach puts your rights at risk we will notify you and the regulator as the law requires.
      </p>

      <LegalH2>Contact and complaints</LegalH2>
      <p>
        {legal.privacyEmail}. India grievance officer: {legal.grievanceOfficerName || unset("name", "GRIEVANCE_OFFICER_NAME")},{" "}
        {legal.grievanceOfficerEmail || unset("email", "GRIEVANCE_OFFICER_EMAIL")}. EU representative (if we have no EU
        establishment): {legal.euRepresentative || unset("name and address", "EU_REPRESENTATIVE")}. We will tell you about material
        changes to this notice before they take effect.
      </p>
    </LegalShell>
  );
}
