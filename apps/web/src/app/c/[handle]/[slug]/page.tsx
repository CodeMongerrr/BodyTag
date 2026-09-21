import type { Metadata } from "next";
import { getCampaignByHandleSlug, serializeCampaign } from "@/lib/campaigns";
import { CampaignStorefront } from "@/components/campaign-storefront";
import { imagePublicUrl } from "@/lib/storage";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ handle: string; slug: string }> }): Promise<Metadata> {
  const { handle, slug } = await params;
  const campaign = await getCampaignByHandleSlug(handle, slug);
  if (!campaign) return { title: "Campaign" };
  const version = campaign.updatedAt.toISOString();
  return {
    title: campaign.title,
    description: campaign.affiliationNote,
    robots: campaign.status === "draft" ? { index: false, follow: false } : undefined,
    openGraph: {
      title: campaign.title,
      images: [{ url: imagePublicUrl(campaign.id, "og", version), width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [imagePublicUrl(campaign.id, "og", version)],
    },
  };
}

export default async function LiveCampaignPage({ params }: { params: Promise<{ handle: string; slug: string }> }) {
  const { handle, slug } = await params;
  const campaign = await getCampaignByHandleSlug(handle, slug);
  if (!campaign || campaign.status === "draft") notFound();
  return <CampaignStorefront campaign={serializeCampaign(campaign)} />;
}
