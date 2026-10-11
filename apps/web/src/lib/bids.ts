import { nanoid } from "nanoid";
import { moderateText, isSafeHttpUrl } from "@bodytag/shared";
import { prisma } from "./db";
import { getPayments } from "./payments";
import { paymentAvailable, PaymentUnavailableError, recordPaymentFailure, recordPaymentSuccess } from "./circuit";
import { enforceMargin, accruedFee } from "./stake";
import { publishCampaign } from "./redis";
import { enqueueImageJobs } from "./queue";
import { appConfig } from "./config";
import { isEmail, isLogoKey, isPositiveInt32 } from "./validation";

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
  const brandEmail = String(input.brandEmail ?? "").trim().toLowerCase();
  const brandName = String(input.brandName ?? "").trim();
  const tagline = input.tagline?.trim() || undefined;
  const url = input.url?.trim() || undefined;
  const qrUrl = input.qrUrl?.trim() || undefined;
  const xHandle = input.xHandle?.trim() || undefined;

  if (!isEmail(brandEmail)) throw new BidError("Enter a valid email address", "invalid_email");
  if (!brandName || brandName.length > 120) throw new BidError("Enter your brand name (120 characters max).", "invalid_brand");
  if ((tagline?.length ?? 0) > 140) throw new BidError("Tagline must be 140 characters or fewer", "invalid_tagline");
  if ((xHandle?.length ?? 0) > 50) throw new BidError("X handle is too long", "invalid_handle");
  if (!isLogoKey(String(input.logoKey ?? ""))) throw new BidError("Upload a PNG, JPEG or WebP logo", "invalid_logo");
  if (!isPositiveInt32(input.expectedPriceCents)) throw new BidError("Invalid price", "invalid_price");

  const blocked = moderateText(brandName) || moderateText(tagline ?? "") || moderateText(url ?? "");
  if (blocked) throw new BidError("Creative failed content policy", "content");

  if (url && !isSafeHttpUrl(url)) {
    throw new BidError("Sponsor website URL must be a valid http:// or https:// URL", "invalid_url");
  }
  if (qrUrl && !isSafeHttpUrl(qrUrl)) {
    throw new BidError("QR URL must be a valid http:// or https:// URL", "invalid_url");
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    include: { creator: true },
  });
  if (!campaign) throw new BidError("Campaign not found", "not_found");
  if (campaign.status !== "live") throw new BidError("This auction is not live", "not_live");
  // A creator buying their own slots would inflate GMV (and the hosted fee base) with money that never leaves them.
  if (brandEmail === campaign.creator.email.toLowerCase()) {
    throw new BidError("Creators can't buy slots on their own campaign.", "own_campaign");
  }
  if (campaign.closeAt.getTime() <= Date.now()) throw new BidError("This auction has closed.", "closed");
  if (vetos(campaign).some((v) => v && brandName.toLowerCase().includes(v))) {
    throw new BidError("This brand is on the creator veto list", "veto");
  }

  if (!(await paymentAvailable())) throw new PaymentUnavailableError();

  // The slot must belong to the campaign being bid on, otherwise a bid could dodge another campaign's
  // live/veto checks by pairing its own campaignId with a foreign slot.
  const slot = await prisma.slot.findFirst({ where: { id: input.slotId, campaignId: campaign.id } });
  if (!slot) throw new BidError("Slot not found in this campaign", "not_found");
  if (slot.currentPriceCents !== input.expectedPriceCents) {
    throw new BidError("Price moved. Refresh and try the new takeover amount.", "price_moved");
  }
  if (slot.currentPriceCents >= MAX_INT32_PRICE_CENTS) {
    throw new BidError("This slot has reached its maximum takeover price", "price_cap");
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
      brandEmail,
      brandName,
      amountCents: slot.currentPriceCents,
      expectedPriceCents: input.expectedPriceCents,
      status: "intent",
      magicToken: nanoid(24),
      creative: {
        create: {
          logoKey: input.logoKey,
          tagline,
          url,
          qrUrl,
          xHandle,
        },
      },
    },
  });

  const payments = getPayments();
  let debited = false;
  try {
    const debit = await payments.debitWallet(brandEmail, {
      cents: slot.currentPriceCents,
      currency: campaign.currency,
    });
    if (debit.ok) {
      debited = true;
      const settled = await settleBid({ bidId: bid.id, paymentId: debit.paymentId ?? `wallet_${bid.id}` });
      await recordPaymentSuccess();
      if (settled.status !== "settled") {
        // settleBid already returned the wallet debit (price moved or campaign closed meanwhile).
        throw new BidError("Someone took this slot a moment ago. Your wallet was credited back; try the new price.", "price_moved");
      }
      return { bid: settled, settled: true as const, checkoutUrl: null as string | null };
    }
    const checkout = await payments.createBidCheckout({
      campaignId: campaign.id,
      slotId: slot.id,
      bidId: bid.id,
      brandEmail,
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
    if (e instanceof BidError) throw e;
    if (debited) await returnWalletDebit(bid.id, brandEmail, slot.currentPriceCents, campaign.currency);
    await recordPaymentFailure();
    throw e;
  }
}

/** The wallet was debited but settlement blew up before committing: give the money back exactly once. */
async function returnWalletDebit(bidId: string, email: string, cents: number, currency: string) {
  try {
    const claimed = await prisma.bid.updateMany({ where: { id: bidId, status: "intent" }, data: { status: "refunded" } });
    if (claimed.count === 1) await getPayments().creditWallet(email, { cents, currency });
  } catch (err) {
    console.error(`Could not return wallet debit for bid ${bidId}:`, err);
  }
}

export const MAX_INT32_PRICE_CENTS = 2_147_483_647;

type SettleTx =
  | { kind: "already_processed" }
  | { kind: "refund"; reason: "price_moved" | "campaign_closed" }
  | { kind: "settled"; currency: string };

export async function settleBid(opts: { bidId: string; paymentId: string }) {
  const include = { slot: true, campaign: { include: { creator: true } }, creative: true } as const;
  const existingBid = await prisma.bid.findUnique({ where: { id: opts.bidId }, include });
  if (!existingBid) throw new BidError("Bid not found", "not_found");
  // Only an unpaid intent can settle. Anything else was already settled, credited or refunded.
  if (existingBid.status !== "intent") return existingBid;

  const result: SettleTx = await prisma.$transaction(
    async (tx) => {
      // Serialise every settlement on this slot. Without the row lock two concurrent payments that both saw the
      // same price would both "win" the slot and the loser would never be refunded.
      const locked = await tx.$queryRaw<Array<{ currentBidId: string | null; currentPriceCents: number }>>`
        SELECT "currentBidId", "currentPriceCents" FROM "Slot" WHERE "id" = ${existingBid.slotId} FOR UPDATE`;
      const slot = locked[0];
      if (!slot) return { kind: "already_processed" as const };

      const bid = await tx.bid.findUniqueOrThrow({ where: { id: opts.bidId }, include: { campaign: true } });
      if (bid.status !== "intent") return { kind: "already_processed" as const };

      // A payment that lands after the auction ended (or before it ever went live) is returned, not honoured.
      if (bid.campaign.status !== "live" && bid.campaign.status !== "paused") {
        await tx.bid.update({ where: { id: bid.id }, data: { status: "refunded", paymentId: opts.paymentId } });
        return { kind: "refund" as const, reason: "campaign_closed" as const };
      }
      if (slot.currentPriceCents !== bid.expectedPriceCents) {
        await tx.bid.update({ where: { id: bid.id }, data: { status: "refunded", paymentId: opts.paymentId } });
        return { kind: "refund" as const, reason: "price_moved" as const };
      }

      // The previous owner (and any bid stranded in 'outbid' by an earlier failed refund) is flagged here and
      // credited after commit, so a crash cannot lose the refund: the next settlement sweeps leftovers.
      if (slot.currentBidId) {
        await tx.bid.updateMany({ where: { id: slot.currentBidId, status: "settled" }, data: { status: "outbid" } });
      }

      // Doubling arithmetic / integer overflow protection (Postgres INT).
      const nextPrice = Math.min(MAX_INT32_PRICE_CENTS, bid.amountCents * 2);
      await tx.bid.update({
        where: { id: bid.id },
        data: { status: "settled", paymentId: opts.paymentId, settledAt: new Date() },
      });
      await tx.slot.update({
        where: { id: bid.slotId },
        data: { currentBidId: bid.id, currentPriceCents: nextPrice, status: "sold" },
      });
      return { kind: "settled" as const, currency: bid.campaign.currency };
    },
    { maxWait: 5_000, timeout: 20_000 },
  );

  if (result.kind === "already_processed") {
    return prisma.bid.findUniqueOrThrow({ where: { id: opts.bidId }, include });
  }

  if (result.kind === "refund") {
    try {
      await getPayments().creditWallet(existingBid.brandEmail, {
        cents: existingBid.amountCents,
        currency: existingBid.campaign.currency,
      });
    } catch (e) {
      // Put the bid back so a webhook retry can try the refund again.
      await prisma.bid.updateMany({ where: { id: opts.bidId, status: "refunded" }, data: { status: "intent" } });
      throw e;
    }
    return prisma.bid.findUniqueOrThrow({ where: { id: opts.bidId }, include });
  }

  await creditOutbidBids(existingBid.slotId, opts.bidId, result.currency);

  const settled = await prisma.bid.findUniqueOrThrow({ where: { id: opts.bidId }, include });

  // The money has moved and the bid is committed; none of the follow-ups may fail the settlement itself.
  const followUps: Array<[string, () => Promise<unknown>]> = [
    ["fee accrual", () => accruedFee(settled.campaignId)],
    ["image jobs", () => enqueueImageJobs(settled.campaignId, settled.id)],
    ["margin check", () => enforceMargin(settled.campaignId)],
    [
      "publish",
      () =>
        publishCampaign(settled.campaignId, {
          type: "bid",
          slotId: settled.slotId,
          bidId: settled.id,
          brandName: settled.brandName,
          amountCents: settled.amountCents,
        }),
    ],
  ];
  for (const [label, run] of followUps) {
    try {
      await run();
    } catch (e) {
      console.error(`settleBid ${label} failed for bid ${settled.id}:`, e);
    }
  }
  return settled;
}

/**
 * Refund every 'outbid' bid on the slot to its brand's wallet. Each bid is claimed with a compare-and-set
 * (outbid -> credited) before money moves, so concurrent settlements cannot double-credit; if the credit itself
 * fails the claim is released and the next settlement on this slot retries it.
 */
async function creditOutbidBids(slotId: string, exceptBidId: string, currency: string) {
  const outbid = await prisma.bid.findMany({ where: { slotId, status: "outbid", id: { not: exceptBidId } } });
  const payments = getPayments();
  for (const ob of outbid) {
    const claim = await prisma.bid.updateMany({ where: { id: ob.id, status: "outbid" }, data: { status: "credited" } });
    if (claim.count !== 1) continue;
    try {
      await payments.creditWallet(ob.brandEmail, { cents: ob.amountCents, currency });
    } catch (e) {
      console.error(`Outbid refund failed for bid ${ob.id}, will retry on next settlement:`, e);
      await prisma.bid.updateMany({ where: { id: ob.id, status: "credited" }, data: { status: "outbid" } });
    }
  }
}
