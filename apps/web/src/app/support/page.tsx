import { LegalShell } from "@/components/legal-shell";
import { createTicketFormAction } from "@/app/actions";

export default function SupportPage() {
  return (
    <LegalShell title="Support">
      <p>Macros, not a black hole. Include campaign, slot, and payment ids.</p>
      <form action={createTicketFormAction} className="mt-6 space-y-3">
        <select name="kind" className="w-full bg-panel p-2">
          <option value="payment">Payment stuck</option>
          <option value="outbid">Wallet credit missing</option>
          <option value="logo">Logo</option>
          <option value="fake">Impersonation</option>
        </select>
        <input name="email" type="email" required placeholder="email" className="w-full bg-panel p-2" />
        <input name="campaignId" placeholder="campaign id" className="w-full bg-panel p-2" />
        <textarea name="body" required className="w-full bg-panel p-2" rows={5} />
        <button className="bg-accent px-4 py-2 text-ink">Send</button>
      </form>
    </LegalShell>
  );
}
