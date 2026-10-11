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

/** Postgres INT ceiling with headroom for later increments. */
export const MAX_STAKE_CENTS = 1_000_000_000;

export async function openingInventoryCents(campaignId: string) {
  const agg = await prisma.slot.aggregate({ where: { campaignId }, _sum: { startPriceCents: true } });
  return agg._sum.startPriceCents ?? 0;
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
  /** Processor payment id when the deposit was actually charged; makes the credit idempotent per payment. */
  paymentId?: string;
}) {
  if (!Number.isInteger(opts.amountCents) || opts.amountCents <= 0 || opts.amountCents > MAX_STAKE_CENTS) {
    throw new Error("Invalid Stake amount");
  }
  const stake = await ensureStake(opts.campaignId, opts.creatorId);
  // Balance and ledger move together or not at all.
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // The unique paymentId on the ledger row is the idempotency guard: a duplicate delivery fails here and rolls
      // the balance increment back with it.
      await tx.stakeLedger.create({
        data: {
          stakeId: stake.id,
          type: "deposit",
          amountCents: opts.amountCents,
          paymentId: opts.paymentId,
          note: "Prepaid hosted-service margin — not escrow of brand funds",
        },
      });
      return tx.stake.update({
        where: { id: stake.id },
        data: {
          amountCents: { increment: opts.amountCents },
          depositedCents: { increment: opts.amountCents },
          status: "held",
        },
      });
    });
  } catch (e) {
    if (opts.paymentId && (e as { code?: string }).code === "P2002") return stake; // already credited
    throw e;
  }
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: opts.campaignId } });
  if (campaign.status === "paused" && campaign.pausedReason?.includes("Stake")) {
    const check = await enforceMargin(opts.campaignId);
    if (check.ok) {
      await prisma.campaign.updateMany({
        where: { id: opts.campaignId, status: "paused" },
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
  const refunded: typeof settledBids = [];
  for (const bid of settledBids) {
    // Claim first (settled -> refunded) so a repeated cancel cannot credit the same bid twice.
    const claim = await prisma.bid.updateMany({ where: { id: bid.id, status: "settled" }, data: { status: "refunded" } });
    if (claim.count !== 1) continue;
    try {
      await payments.creditWallet(bid.brandEmail, { cents: bid.amountCents, currency: campaign.currency });
      refunded.push(bid);
    } catch (e) {
      await prisma.bid.updateMany({ where: { id: bid.id, status: "refunded" }, data: { status: "settled" } });
      throw e;
    }
  }
  return refunded;
}

export async function captureAndRefundStake(campaignId: string, reason: "fulfilled" | "cancelled") {
  const initial = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (initial.status === "fulfilled" || initial.status === "closed") {
    throw new Error("This campaign has already been settled.");
  }
  const creator = await prisma.user.findUniqueOrThrow({ where: { id: initial.creatorId } });

  if (reason === "cancelled") {
    await refundWinningBids(campaignId);
  }
  const { gmv, fee } = await accruedFee(campaignId);

  // Claim the Stake in one atomic step (balance -> 0) so the refund can only ever be paid out once; the
  // campaign flips to its final state in the same transaction.
  const settled = await prisma.$transaction(async (tx) => {
    const closing = await tx.campaign.updateMany({
      where: { id: campaignId, status: { in: ["draft", "live", "paused"] } },
      data: { status: reason === "fulfilled" ? CampaignStatus.fulfilled : CampaignStatus.closed },
    });
    if (closing.count !== 1) throw new Error("This campaign has already been settled.");

    const stake = await tx.stake.findUnique({ where: { campaignId } });
    let capture = 0;
    let refund = 0;
    if (stake && stake.amountCents > 0) {
      capture = reason === "cancelled" ? 0 : Math.min(fee, stake.amountCents);
      refund = Math.max(0, stake.amountCents - capture);
      await tx.stake.update({
        where: { id: stake.id },
        data: {
          amountCents: 0,
          capturedCents: { increment: capture },
          refundedCents: { increment: refund },
          status: capture > 0 ? "captured" : "refunded",
        },
      });
      await tx.stakeLedger.createMany({
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
    await tx.campaign.update({
      where: { id: campaignId },
      data: { accruedFeeCents: capture, gmvCents: reason === "cancelled" ? 0 : gmv },
    });
    return { capture, refund };
  });

  if (settled.refund > 0) {
    await getPayments().creditWallet(creator.email, { cents: settled.refund, currency: initial.currency });
  }
  return { fee: settled.capture, refund: settled.refund, gmv: reason === "cancelled" ? 0 : gmv };
}
