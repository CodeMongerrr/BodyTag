import { prisma } from "./db";
import { isAvatarMeta, livePath } from "@bodytag/shared";
import { appConfig } from "./config";

export async function getCampaignByHandleSlug(handle: string, slug: string) {
  const creator = await prisma.user.findUnique({ where: { handle } });
  if (!creator) return null;
  return prisma.campaign.findUnique({
    where: { creatorId_slug: { creatorId: creator.id, slug } },
    include: campaignInclude,
  });
}

export async function getCampaignById(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    include: campaignInclude,
  });
}

export const campaignInclude = {
  creator: true,
  surfaces: { orderBy: { sortOrder: "asc" as const } },
  slots: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      bids: {
        where: { status: { in: ["settled" as const, "outbid" as const, "credited" as const] } },
        orderBy: { settledAt: "asc" as const },
        take: 40,
        include: { creative: true },
      },
    },
  },
  stakes: { include: { ledger: { orderBy: { createdAt: "desc" as const }, take: 20 } } },
};

export function absoluteLiveUrl(handle: string, slug: string) {
  return `${appConfig.appUrl}${livePath(handle, slug)}`;
}

export function shortUrl(code: string) {
  return `${appConfig.shortUrl}/s/${code}`;
}

function ownerFromBid(bid: {
  brandName: string;
  id: string;
  amountCents?: number;
  settledAt?: Date | null;
  creative: { tagline: string | null; url: string | null; qrUrl: string | null; xHandle: string | null; logoKey: string } | null;
} | undefined) {
  if (!bid) return null;
  return {
    brandName: bid.brandName,
    tagline: bid.creative?.tagline ?? null,
    url: bid.creative?.url ?? null,
    qrUrl: bid.creative?.qrUrl ?? null,
    xHandle: bid.creative?.xHandle ?? null,
    logoKey: bid.creative?.logoKey ?? null,
    bidId: bid.id,
    amountCents: bid.amountCents ?? 0,
    settledAt: bid.settledAt ? bid.settledAt.toISOString() : null,
    magicToken: undefined as string | undefined,
  };
}

export function serializeCampaign(campaign: NonNullable<Awaited<ReturnType<typeof getCampaignByHandleSlug>>>) {
  const currentBids = campaign.slots.map((s) => {
    const settled = [...s.bids].reverse().find((b) => b.status === "settled") ?? s.bids.at(-1);
    return {
      id: s.id,
      name: s.name,
      startPriceCents: s.startPriceCents,
      currentPriceCents: s.currentPriceCents,
      takeoverCents: s.currentPriceCents,
      viewCount: s.viewCount,
      status: s.status,
      rect: s.rect,
      marker: s.marker,
      sizeNote: s.sizeNote,
      hyroxCm: s.hyroxCm,
      surfaceId: s.surfaceId,
      owner: ownerFromBid(settled),
      history: s.bids.map((b) => ownerFromBid(b)).filter((o): o is NonNullable<ReturnType<typeof ownerFromBid>> => o !== null),
    };
  });
  return {
    id: campaign.id,
    title: campaign.title,
    slug: campaign.slug,
    theme: campaign.theme,
    status: campaign.status,
    eventName: campaign.eventName,
    eventDate: campaign.eventDate.toISOString(),
    eventCity: campaign.eventCity,
    affiliationNote: campaign.affiliationNote,
    closeAt: campaign.closeAt.toISOString(),
    targetTotalCents: campaign.targetTotalCents,
    currency: campaign.currency,
    raisedCents: campaign.raisedCents,
    gmvCents: campaign.gmvCents,
    accruedFeeCents: campaign.accruedFeeCents,
    pausedReason: campaign.pausedReason,
    arenaConfig: campaign.arenaConfig,
    vetoList: campaign.vetoList,
    shortCode: campaign.shortCode,
    soundtrackKey: campaign.soundtrackKey,
    creator: {
      handle: campaign.creator.handle,
      name: campaign.creator.name,
      verified: campaign.creator.verified,
      kycTier: campaign.creator.kycTier,
      socialX: campaign.creator.socialX,
    },
    surfaces: campaign.surfaces.map((s) => ({
      id: s.id,
      kind: s.kind,
      objectKey: s.objectKey,
      label: s.label,
      width: s.width,
      height: s.height,
      // Public page only needs provenance (for the attribution credit); ids stay in the dashboard.
      meta: isAvatarMeta(s.meta) ? { source: s.meta.source } : null,
    })),
    slots: currentBids,
    stake: campaign.stakes[0]
      ? {
          amountCents: campaign.stakes[0].amountCents,
          depositedCents: campaign.stakes[0].depositedCents,
          capturedCents: campaign.stakes[0].capturedCents,
          refundedCents: campaign.stakes[0].refundedCents,
          status: campaign.stakes[0].status,
        }
      : null,
  };
}

export type PublicCampaign = ReturnType<typeof serializeCampaign>;
