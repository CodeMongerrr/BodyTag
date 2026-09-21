import { LegalShell } from "@/components/legal-shell";

export default function ContentPolicyPage() {
  return (
    <LegalShell title="Content policy">
      <p>
        Inspired by the four-page legal pack used by independent walking-billboard campaigns. Applies in the creator&apos;s
        home, the event venue, and the sponsor&apos;s home (including India and Singapore).
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Illegal content, scams, phishing URLs, malware.</li>
        <li>Hate, harassment, extremist symbols.</li>
        <li>Adult / NSFW inventory or logos — revealing body slots that would kill card-network approval are banned on hosted.</li>
        <li>Impersonation of people, events, or brands. Celebrity handles require matching social OAuth.</li>
        <li>IP theft. Sponsors must own or license the mark.</li>
        <li>Shock-for-the-slot gore or exploitative imagery.</li>
        <li>No claim of official event affiliation (HYROX, TOKEN2049, etc.) unless you actually have it.</li>
      </ul>
      <p>
        Creators may keep a veto list. Logos are scanned before composite. We pause first, then decide within 24 hours on
        reports. This is how processors and venues stay quiet.
      </p>
    </LegalShell>
  );
}
