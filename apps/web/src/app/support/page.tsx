import { LegalShell } from "@/components/legal-shell";
import { SupportForm } from "@/components/support-form";

export default function SupportPage() {
  return (
    <LegalShell title="Support">
      <p>Macros, not a black hole. Include campaign, slot, and payment ids.</p>
      <SupportForm />
    </LegalShell>
  );
}
