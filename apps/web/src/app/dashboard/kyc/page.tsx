import Link from "next/link";
import { kycFormAction } from "@/app/actions";
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
      <form action={kycFormAction} className="mt-8 space-y-3">
        <input name="phone" placeholder="Phone" defaultValue={user.phone ?? ""} className="w-full bg-panel p-3" />
        <input name="socialX" placeholder="X handle" defaultValue={user.socialX ?? ""} className="w-full bg-panel p-3" />
        <input name="socialInstagram" placeholder="Instagram" defaultValue={user.socialInstagram ?? ""} className="w-full bg-panel p-3" />
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="idSelfie" /> I uploaded a government ID + selfie (demo auto-approves L2)
        </label>
        <button className="bg-accent px-4 py-2 text-ink">Submit KYC</button>
      </form>
      <p className="mt-6 text-sm">
        <Link href="/dashboard">Back to dashboard</Link>
      </p>
    </main>
  );
}
