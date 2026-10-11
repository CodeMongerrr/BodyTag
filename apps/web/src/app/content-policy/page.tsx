import { LegalH2, LegalShell } from "@/components/legal-shell";
import { appConfig } from "@/lib/config";

export default function ContentPolicyPage() {
  return (
    <LegalShell title="Content policy">
      <p>
        This policy applies to every creative, campaign page, avatar and outfit on BodyTag. Content must be lawful where it is
        shown, where the creator performs, and where the sponsor is based.
      </p>

      <LegalH2>Not allowed</LegalH2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Illegal goods or services, scams, phishing links, malware, or anything that evades sanctions.</li>
        <li>Adult or sexual content, nudity, escort or adult-dating services, or placements that require exposing intimate areas.</li>
        <li>Gambling, betting, lotteries, casinos, sweepstakes and real-money gaming.</li>
        <li>
          Crypto exchanges, token sales, leveraged trading, investment or “get rich” schemes, loans, and any financial service
          that is not licensed where it is promoted.
        </li>
        <li>Weapons, explosives, illegal drugs and paraphernalia, tobacco and vapes, and alcohol.</li>
        <li>Political, election or issue advertising, and content that disparages a religion, a state or its leaders.</li>
        <li>Hate, harassment, extremist symbols, violence, gore, shock imagery, or content promoting self-harm.</li>
        <li>Anything sexualising or exploiting minors, or aimed at children.</li>
        <li>
          Impersonation of people, brands, officials or events; avatars or images of a real person without their written
          consent; deceptive claims of official affiliation (for example with a conference or race).
        </li>
        <li>Content that infringes copyright, trademarks or publicity rights. Sponsors must own or license what they upload.</li>
        <li>Unproven health or medical claims and unapproved medicines.</li>
      </ul>
      <p>
        Creators must also follow venue rules and local law on dress and public conduct, and disclose sponsorships in their own
        posts as local advertising rules require.
      </p>

      <LegalH2>How we enforce it</LegalH2>
      <p>
        Logos are checked automatically before they appear, and creators can keep a veto list for brands or categories they will
        not carry. Anyone can report a campaign or creative from its page or at {appConfig.supportEmail}. We review reports as
        fast as we can and aim to decide within 24 hours; where a report looks serious we pause the page first, keeping the
        evidence, and then decide.
      </p>
      <p>
        If we remove content or restrict an account we tell the affected person what we did and why, and how to ask us to
        reconsider by replying to that message. Repeat or serious breaches lead to account suspension, and we may report illegal
        content to the authorities. Purchases removed for a breach are not refunded, as explained in the Refund policy.
      </p>
    </LegalShell>
  );
}
