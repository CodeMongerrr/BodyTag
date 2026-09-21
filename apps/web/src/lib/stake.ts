import {
  feeFromGmv,
  minStakeCents,
  nextPossibleTakeoverCents,
  stakeCoversNext,
} from "@bodytag/shared";
import { CampaignStatus } from "@bodytag/db";
import { appConfig } from "./config";
import { prisma } from "./db";
import { getPayments } from "./payments";
import { publishCampaign } from "./redis";

export async function openingInventoryCents(campaignId: string) {
  const slots = await prisma.slot.findMany({ where: { campaignId } });
  return slots.reduce((s, sl) => s + sl.startPriceCents, 0);
}

export async function ensureStake(campaignId: string, creatorId: string) {
  return prisma.stake.upsert({
    where: { campaignId },
    update: {},
    create: {
      campaignId,
      creatorId,
      amountCents: 0,
      depositedCents: 0,
    },
  });
}

export async function depositStake(opts: {
  campaignId: string;
  creatorId: string;
  creatorEmail: string;
  amountCents: number;
}) {
  const stake = await ensureStake(opts.campaignId, opts.creatorId);
  const updated = await prisma.stake.update({
    where: { id: stake.id },
    data: {
      amountCents: { increment: opts.amountCents },
      depositedCents: { increment: opts.amountCents },
      status: "held",
    },
  });
  await prisma.stakeLedger.create({
    data: {
      stakeId: stake.id,
      type: "deposit",
      amountCents: opts.amountCents,
      note: "Prepaid hosted-service margin — not escrow of brand funds",
    },
  });
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: opts.campaignId } });
  if (campaign.status === "paused" && campaign.pausedReason?.includes("Stake")) {
    const check = await enforceMargin(opts.campaignId);
    if (check.ok) {
      await prisma.campaign.update({
        where: { id: opts.campaignId },
        data: { status: "live", pausedReason: null },
      });
      await publishCampaign(opts.campaignId, { type: "live" });
    }
  }
  return updated;
}

export async function winningGmv(campaignId: string) {
  const slots = await prisma.slot.findMany({
    where: { campaignId },
    include: { bids: { where: { status: "settled" }, orderBy: { settledAt: "desc" }, take: 1 } },
  });
  return slots.reduce((sum, slot) => sum + (slot.bids[0] ? slot.bids[0].amountCents : 0), 0);
}

export async function accruedFee(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const gmv = await winningGmv(campaignId);
  const fee = feeFromGmv(gmv, appConfig.hostedFeeBps);
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { gmvCents: gmv, accruedFeeCents: fee, raisedCents: gmv },
  });
  return { gmv, fee };
}

export async function enforceMargin(campaignId: string) {
  if (!appConfig.requireStake) return { ok: true as const, remaining: 0, gmv: 0, next: 0 };
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { slots: true, stakes: true },
  });
  const remaining = campaign.stakes[0]?.amountCents ?? 0;
  const gmv = await winningGmv(campaignId);
  const next = nextPossibleTakeoverCents(campaign.slots.map((s) => s.currentPriceCents));
  const ok = stakeCoversNext(remaining, gmv, next, appConfig.hostedFeeBps);
  if (!ok && campaign.status === "live") {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "paused",
        pausedReason:
          "Stake does not cover 1% of current GMV plus the next takeover. Top up the prepaid hosted-service margin to resume.",
      },
    });
    await publishCampaign(campaignId, { type: "paused", reason: "stake_margin" });
  }
  return { ok, remaining, gmv, next };
}

export async function canPublish(campaignId: string, kycTier: number) {
  const opening = await openingInventoryCents(campaignId);
  const min = minStakeCents(opening, kycTier);
  if (!appConfig.requireStake) return { ok: true, min: 0, opening, held: 0 };
  const stake = await prisma.stake.findUnique({ where: { campaignId } });
  return { ok: (stake?.amountCents ?? 0) >= min, min, opening, held: stake?.amountCents ?? 0 };
}

export async function refundWinningBids(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const settledBids = await prisma.bid.findMany({
    where: { campaignId, status: "settled" },
  });
  const payments = getPayments();
  for (const bid of settledBids) {
    await payments.creditWallet(bid.brandEmail, {
      cents: bid.amountCents,
      currency: campaign.currency,
    });
    await prisma.bid.update({
      where: { id: bid.id },
      data: { status: "refunded" },
    });
  }
  return settledBids;
}

export async function captureAndRefundStake(campaignId: string, reason: "fulfilled" | "cancelled") {
  const { gmv, fee } = await accruedFee(campaignId);
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const creator = await prisma.user.findUniqueOrThrow({ where: { id: campaign.creatorId } });

  if (reason === "cancelled") {
    await refundWinningBids(campaignId);
  }

  const stake = await prisma.stake.findUnique({ where: { campaignId } });
  const capture = reason === "cancelled" ? 0 : (stake ? Math.min(fee, stake.amountCents) : 0);
  const refund = stake ? Math.max(0, stake.amountCents - capture) : 0;

  if (stake) {
    if (refund > 0) {
      await getPayments().creditWallet(creator.email, { cents: refund, currency: campaign.currency });
    }
    await prisma.stake.update({
      where: { id: stake.id },
      data: {
        amountCents: 0,
        capturedCents: { increment: capture },
        refundedCents: { increment: refund },
        status: capture > 0 ? "captured" : "refunded",
      },
    });
    await prisma.stakeLedger.createMany({
      data: [
        ...(capture
          ? [{ stakeId: stake.id, type: "capture", amountCents: capture, gmvSnapshot: gmv, note: "1% hosted software margin on winning GMV" }]
          : []),
        ...(refund
          ? [{ stakeId: stake.id, type: "refund", amountCents: refund, gmvSnapshot: gmv, note: "Unused Stake returned to creator wallet" }]
          : []),
      ],
    });
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: reason === "fulfilled" ? CampaignStatus.fulfilled : CampaignStatus.closed,
      accruedFeeCents: capture,
      gmvCents: reason === "cancelled" ? 0 : gmv,
    },
  });
  return { fee: capture, refund, gmv: reason === "cancelled" ? 0 : gmv };
}
