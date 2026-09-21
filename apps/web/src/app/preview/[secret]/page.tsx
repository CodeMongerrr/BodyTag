import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { serializeCampaign, campaignInclude } from "@/lib/campaigns";
import { CampaignStorefront } from "@/components/campaign-storefront";

export default async function PreviewPage({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { previewSecret: secret },
    include: campaignInclude,
  });
  if (!campaign) notFound();
  return (
    <>
      <meta name="robots" content="noindex,nofollow" />
      <CampaignStorefront campaign={serializeCampaign(campaign)} preview />
    </>
  );
}
