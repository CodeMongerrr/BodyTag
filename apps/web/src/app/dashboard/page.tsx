import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney, livePath } from "@bodytag/shared";
import { appConfig } from "@/lib/config";

export default async function DashboardPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/sign-in");
  }
  const campaigns = await prisma.campaign.findMany({
    where: { creatorId: user.id },
    orderBy: { createdAt: "desc" },
    include: { stakes: true, slots: true },
  });
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl">Floor manager</h1>
          <p className="pit-label mt-2 text-accent">
            Creator L{user.kycTier}
            {user.verified ? " · verified" : ""}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/kyc" className="border border-line px-4 py-2 no-underline">
            KYC
          </Link>
          <Link href="/dashboard/tickets" className="border border-line px-4 py-2 no-underline">
            Tickets
          </Link>
          <Link href="/dashboard/campaigns/new" className="bg-accent px-4 py-2 font-medium text-ink no-underline">
            New campaign
          </Link>
        </div>
      </div>
      <p className="mt-4 max-w-2xl text-sm text-muted">
        Hosted fee is {appConfig.hostedFeeBps / 100}% of winning GMV, taken from Stake after event proof.{" "}
        {appConfig.requireStake ? "Stake is required to publish." : "Self-host mode: Stake is optional."} Brands pay your
        processor, not BodyTag.
      </p>
      <ul className="mt-10 divide-y divide-line border border-line">
        {campaigns.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <Link href={`/dashboard/campaigns/${c.id}`} className="text-xl no-underline hover:text-accent">
                {c.title}
              </Link>
              <p className="text-xs text-muted">
                {c.theme} · {c.status} · {c.slots.length} slots · Stake{" "}
                {formatMoney(c.stakes[0]?.amountCents ?? 0)} · GMV {formatMoney(c.gmvCents)}
              </p>
            </div>
            <div className="flex gap-3 text-sm">
              {c.status !== "draft" && (
                <Link href={livePath(user.handle, c.slug)} className="text-accent">
                  Live URL
                </Link>
              )}
              <Link href={`/dashboard/campaigns/${c.id}`}>Edit</Link>
            </div>
          </li>
        ))}
        {campaigns.length === 0 && <li className="p-8 text-muted">No campaigns yet.</li>}
      </ul>
    </main>
  );
}
