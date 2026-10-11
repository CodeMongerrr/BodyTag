import { nanoid } from "nanoid";
import { moderateText, isSafeHttpUrl } from "@bodytag/shared";
import { prisma } from "./db";
import { getPayments } from "./payments";
import { paymentAvailable, PaymentUnavailableError, recordPaymentFailure, recordPaymentSuccess } from "./circuit";
import { enforceMargin, accruedFee } from "./stake";
import { publishCampaign } from "./redis";
import { enqueueImageJobs } from "./queue";
import { appConfig } from "./config";

export class BidError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

function vetos(campaign: { vetoList: unknown }) {
  const list = Array.isArray(campaign.vetoList) ? (campaign.vetoList as string[]) : [];
  return list.map((v) => v.toLowerCase());
}

export async function createBidIntent(input: {
  campaignId: string;
  slotId: string;
  brandEmail: string;
  brandName: string;
  logoKey: string;
  tagline?: string;
  url?: string;
  qrUrl?: string;
  xHandle?: string;
  expectedPriceCents: number;
}) {
  const brandName = input.brandName.trim();
  const brandEmail = input.brandEmail.trim().toLowerCase();
  if (!brandName || brandName.length > 120) throw new BidError("Enter your brand name (120 characters max).", "invalid_brand");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brandEmail)) throw new BidError("Enter a valid email for your receipt.", "invalid_email");
  if (!input.logoKey) throw new BidError("A logo is required.", "invalid_logo");
  input = { ...input, brandName, brandEmail };

  const blocked =
    moderateText(input.brandName) ||
    moderateText(input.tagline ?? "") ||
    moderateText(input.url ?? "");
  if (blocked) throw new BidError("Creative failed content policy", "content");

  if (input.url && !isSafeHttpUrl(input.url)) {
    throw new BidError("Sponsor website URL must be a valid http:// or https:// URL", "invalid_url");
  }
  if (input.qrUrl && !isSafeHttpUrl(input.qrUrl)) {
    throw new BidError("QR URL must be a valid http:// or https:// URL", "invalid_url");
  }

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: input.campaignId },
    include: { creator: true },
  });
  if (campaign.status !== "live") throw new BidError("This auction is not live", "not_live");
  // A creator buying their own slots would inflate GMV (and the hosted fee base) with money that never leaves them.
  if (brandEmail === campaign.creator.email.toLowerCase()) {
    throw new BidError("Creators can't buy slots on their own campaign.", "own_campaign");
  }
  if (campaign.closeAt.getTime() <= Date.now()) throw new BidError("This auction has closed.", "closed");
  if (vetos(campaign).some((v) => input.brandName.toLowerCase().includes(v))) {
    throw new BidError("This brand is on the creator veto list", "veto");
  }

  if (!(await paymentAvailable())) throw new PaymentUnavailableError();

  const slot = await prisma.slot.findUniqueOrThrow({ where: { id: input.slotId } });
  // The slot must belong to the campaign whose status/veto list/currency we just validated.
  if (slot.campaignId !== campaign.id) throw new BidError("That slot is not part of this campaign.", "bad_slot");
  if (slot.currentPriceCents !== input.expectedPriceCents) {
    throw new BidError("Price moved. Refresh and try the new takeover amount.", "price_moved");
  }

  if (slot.currentBidId) {
    const current = await prisma.bid.findUnique({ where: { id: slot.currentBidId }, select: { brandEmail: true, status: true } });
    if (current?.status === "settled" && current.brandEmail === brandEmail) {
      throw new BidError("You already own this slot. Update your logo from the sponsor portal instead.", "already_owner");
    }
  }

  const bid = await prisma.bid.create({
    data: {
      slotId: slot.id,
      campaignId: campaign.id,
      brandEmail: input.brandEmail.toLowerCase(),
      brandName: input.brandName,
      amountCents: slot.currentPriceCents,
      expectedPriceCents: input.expectedPriceCents,
      status: "intent",
      magicToken: nanoid(24),
      creative: {
        create: {
          logoKey: input.logoKey,
          tagline: input.tagline,
          url: input.url,
          qrUrl: input.qrUrl,
          xHandle: input.xHandle,
        },
      },
    },
  });

  const payments = getPayments();
  try {
    const debit = await payments.debitWallet(input.brandEmail.toLowerCase(), {
      cents: slot.currentPriceCents,
      currency: campaign.currency,
    });
    if (debit.ok) {
      const settled = await settleBid({ bidId: bid.id, paymentId: debit.paymentId ?? `wallet_${bid.id}` });
      await recordPaymentSuccess();
      // settleBid credits the wallet back when someone else took the slot first; do not report that as a win.
      if (settled.status !== "settled") {
        throw new BidError("Someone took this slot a moment ago. Your wallet was credited back; try the new price.", "price_moved");
      }
      return { bid, settled: true as const, checkoutUrl: null as string | null };
    }
    const checkout = await payments.createBidCheckout({
      campaignId: campaign.id,
      slotId: slot.id,
      bidId: bid.id,
      brandEmail: input.brandEmail,
      amountCents: slot.currentPriceCents,
      currency: campaign.currency,
      expectedPriceCents: input.expectedPriceCents,
      returnUrl: `${appConfig.appUrl}/@${campaign.creator.handle}/${campaign.slug}?bid=ok&slot=${slot.id}`,
    });
    await prisma.bid.update({
      where: { id: bid.id },
      data: { checkoutSessionId: checkout.sessionId },
    });
    await recordPaymentSuccess();
    return { bid, settled: false as const, checkoutUrl: checkout.checkoutUrl };
  } catch (e) {
    if (!(e instanceof BidError)) await recordPaymentFailure();
    throw e;
  }
}

export const MAX_INT32_PRICE_CENTS = 2_147_483_647;

export async function settleBid(opts: { bidId: string; paymentId: string }) {
  // Idempotency fast path: if bid is already settled or credited, return early
  // without re-executing crediting logic, fee calculation, or notifications.
  const existingBid = await prisma.bid.findUnique({
    where: { id: opts.bidId },
    include: { slot: true, campaign: { include: { creator: true } }, creative: true },
  });
  if (!existingBid) {
    throw new BidError("Bid not found", "not_found");
  }
  if (existingBid.status === "settled" || existingBid.status === "credited") {
    return existingBid;
  }

  const result = await prisma.$transaction(async (tx) => {
    const bid = await tx.bid.findUniqueOrThrow({
      where: { id: opts.bidId },
      include: { slot: true, campaign: true, creative: true },
    });
    // Ensure idempotency under race conditions within the transaction
    if (bid.status === "settled" || bid.status === "credited") {
      return { kind: "already_processed" as const, bid };
    }

    const slot = await tx.slot.findUniqueOrThrow({ where: { id: bid.slotId } });
    if (slot.currentPriceCents !== bid.expectedPriceCents) {
      await tx.bid.update({ where: { id: bid.id }, data: { status: "credited", paymentId: opts.paymentId } });
      return { kind: "price_moved" as const, bid };
    }

    // Collect outbid bids to credit
    const outbidBidsToCredit: Array<{ id: string; brandEmail: string; amountCents: number }> = [];

    if (slot.currentBidId) {
      const prev = await tx.bid.findUnique({ where: { id: slot.currentBidId } });
      if (prev && (prev.status === "settled" || prev.status === "outbid")) {
        await tx.bid.update({ where: { id: prev.id }, data: { status: "credited" } });
        outbidBidsToCredit.push({
          id: prev.id,
          brandEmail: prev.brandEmail,
          amountCents: prev.amountCents,
        });
      }
    }

    // Sweep any other bids left in 'outbid' status for this slot to prevent double-crediting
    const olderOutbids = await tx.bid.findMany({
      where: { slotId: slot.id, status: "outbid", id: { not: slot.currentBidId ?? "" } },
    });
    for (const ob of olderOutbids) {
      await tx.bid.update({ where: { id: ob.id }, data: { status: "credited" } });
      outbidBidsToCredit.push({
        id: ob.id,
        brandEmail: ob.brandEmail,
        amountCents: ob.amountCents,
      });
    }

    // Doubling arithmetic / integer overflow protection:
    // Guard nextPrice against exceeding 32-bit signed integer limit (2,147,483,647 cents)
    const nextPrice = Math.min(MAX_INT32_PRICE_CENTS, bid.amountCents * 2);

    await tx.bid.update({
      where: { id: bid.id },
      data: { status: "settled", paymentId: opts.paymentId, settledAt: new Date() },
    });
    await tx.slot.update({
      where: { id: slot.id },
      data: {
        currentBidId: bid.id,
        currentPriceCents: nextPrice,
        status: "sold",
      },
    });

    return {
      kind: "settled" as const,
      bid,
      outbidBidsToCredit,
      currency: bid.campaign.currency,
    };
  });

  if (result.kind === "already_processed") {
    return result.bid;
  }

  if (result.kind === "price_moved") {
    const payments = getPayments();
    await payments.creditWallet(result.bid.brandEmail, {
      cents: result.bid.amountCents,
      currency: result.bid.campaign.currency,
    });
    return { ...result.bid, status: "credited" as const, priceMoved: true };
  }

  // Credit the outbid brand(s) once with campaign currency
  const payments = getPayments();
  for (const outbid of result.outbidBidsToCredit) {
    await payments.creditWallet(outbid.brandEmail, {
      cents: outbid.amountCents,
      currency: result.currency,
    });
  }

  const settled = await prisma.bid.findUniqueOrThrow({
    where: { id: opts.bidId },
    include: { slot: true, campaign: { include: { creator: true } }, creative: true },
  });

  await accruedFee(settled.campaignId);
  await enqueueImageJobs(settled.campaignId, settled.id);
  await enforceMargin(settled.campaignId);
  await publishCampaign(settled.campaignId, {
    type: "bid",
    slotId: settled.slotId,
    bidId: settled.id,
    brandName: settled.brandName,
    amountCents: settled.amountCents,
  });
  return settled;
}
