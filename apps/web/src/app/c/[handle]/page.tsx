import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { livePath } from "@bodytag/shared";

export default async function CreatorHandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const creator = await prisma.user.findUnique({ where: { handle } });
  if (!creator) notFound();

  // Find their most recent live or active campaign
  const campaign = await prisma.campaign.findFirst({
    where: { creatorId: creator.id, status: { in: ["live", "paused", "closed"] } },
    orderBy: { createdAt: "desc" },
  });

  if (!campaign) {
    // If no live campaign, check if any campaign exists
    const anyCampaign = await prisma.campaign.findFirst({
      where: { creatorId: creator.id },
      orderBy: { createdAt: "desc" },
    });
    if (!anyCampaign) notFound();
    redirect(livePath(handle, anyCampaign.slug));
  }

  redirect(livePath(handle, campaign.slug));
}
