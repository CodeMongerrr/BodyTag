import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CampaignEditor } from "@/components/campaign-editor";
import { canPublish } from "@/lib/stake";

export default async function CampaignEditPage({ params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/sign-in");
  }
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { surfaces: true, slots: true, stakes: true },
  });
  if (!campaign || campaign.creatorId !== user.id) notFound();
  const stake = await canPublish(campaign.id, user.kycTier);
  return (
    <CampaignEditor
      handle={user.handle}
      minStake={stake.min}
      campaign={{
        id: campaign.id,
        title: campaign.title,
        slug: campaign.slug,
        theme: campaign.theme,
        status: campaign.status,
        previewSecret: campaign.previewSecret,
        shortCode: campaign.shortCode,
        gmvCents: campaign.gmvCents,
        accruedFeeCents: campaign.accruedFeeCents,
        vetoList: campaign.vetoList,
        arenaConfig: campaign.arenaConfig,
        surfaces: campaign.surfaces,
        slots: campaign.slots,
        stakeHeld: campaign.stakes[0]?.amountCents ?? 0,
      }}
    />
  );
}
