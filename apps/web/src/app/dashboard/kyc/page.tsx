import Link from "next/link";
import { KycForm } from "@/components/kyc-form";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function KycPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/sign-in");
  }
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-4xl">Trust ladder</h1>
      <p className="mt-3 text-sm text-muted">
        Progressive, not a wall. L0 email can draft. L1 phone + social can publish. L2 ID + selfie gets the Verified badge.
        L3 is KYB for high volume. Demo provider is labeled mock-persona — swap for Persona/Didit in production.
      </p>
      <p className="mt-4 font-mono text-sm text-accent">Current: L{user.kycTier} {user.verified ? "verified" : "unverified"}</p>
      <KycForm phone={user.phone ?? ""} socialX={user.socialX ?? ""} socialInstagram={user.socialInstagram ?? ""} />
      <p className="mt-6 text-sm">
        <Link href="/dashboard">Back to dashboard</Link>
      </p>
    </main>
  );
}
