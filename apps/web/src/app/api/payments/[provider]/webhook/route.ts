import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { BidError, settleBid } from "@/lib/bids";
import { appConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { checkPaymentCoversBid } from "@/lib/payments/verify";
import { depositStake } from "@/lib/stake";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyDodoSignature(rawBody: string, headers: Headers, secret: string): boolean {
  if (!secret) return false;
  const webhookSignature = headers.get("webhook-signature") ?? headers.get("x-webhook-signature");
  if (!webhookSignature) return false;

  const webhookId = headers.get("webhook-id");
  const webhookTimestamp = headers.get("webhook-timestamp");

  if (webhookTimestamp) {
    const ts = parseInt(webhookTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(ts) || Math.abs(now - ts) > 300) {
      return false;
    }
  }

  const keyBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf8");

  const sigEntries = webhookSignature.split(/\s+/);
  for (const entry of sigEntries) {
    const parts = entry.split(",");
    const v = parts.length === 2 ? parts[0] : null;
    const sig = parts.length === 2 ? parts[1] : entry;

    if (v === "v1" && webhookId && webhookTimestamp) {
      const payloadToSign = `${webhookId}.${webhookTimestamp}.${rawBody}`;
      const expectedBase64 = crypto.createHmac("sha256", keyBytes).update(payloadToSign).digest("base64");
      const expectedHex = crypto.createHmac("sha256", keyBytes).update(payloadToSign).digest("hex");
      if (timingSafeEqualStr(sig, expectedBase64) || timingSafeEqualStr(sig, expectedHex)) {
        return true;
      }
    }

    const rawExpectedBase64 = crypto.createHmac("sha256", keyBytes).update(rawBody).digest("base64");
    const rawExpectedHex = crypto.createHmac("sha256", keyBytes).update(rawBody).digest("hex");
    if (timingSafeEqualStr(sig, rawExpectedBase64) || timingSafeEqualStr(sig, rawExpectedHex)) {
      return true;
    }
  }

  return false;
}

function verifyStripeSignature(rawBody: string, headers: Headers, secret: string): boolean {
  if (!secret) return false;
  const sigHeader = headers.get("stripe-signature");
  if (!sigHeader) return false;

  const items = sigHeader.split(",");
  let timestamp = "";
  const signatures: string[] = [];

  for (const item of items) {
    const [key, val] = item.trim().split("=");
    if (key === "t") timestamp = val;
    if (key === "v1") signatures.push(val);
  }

  if (!timestamp || signatures.length === 0) return false;

  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return false;
  }

  const payload = `${timestamp}.${rawBody}`;
  const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  for (const sig of signatures) {
    if (timingSafeEqualStr(sig, expectedSig)) {
      return true;
    }
  }

  return false;
}

/** Settle, but answer 200 for a bid we have never heard of so the processor stops retrying a hopeless event. */
async function settleFromWebhook(bidId: string, paymentId: string) {
  try {
    await settleBid({ bidId, paymentId });
  } catch (e) {
    if (e instanceof BidError && e.code === "not_found") return;
    throw e;
  }
}

type DodoEventData = {
  metadata?: Record<string, string>;
  payment_id?: string;
  total_amount?: unknown;
  currency?: unknown;
  refund_id?: string;
  dispute_id?: string;
  dispute_status?: string;
};

/** Disputes and refunds change money we already booked: open an operator ticket linked to the bid, once per delivery. */
async function recordPaymentIncident(type: string, data: DodoEventData, webhookId: string | null) {
  const marker = `[${webhookId ?? `${type}:${data.payment_id ?? data.refund_id ?? data.dispute_id ?? "unknown"}`}]`;
  const existing = await prisma.supportTicket.findFirst({ where: { body: { startsWith: marker } }, select: { id: true } });
  if (existing) return;
  const bid = data.payment_id
    ? await prisma.bid.findFirst({ where: { paymentId: data.payment_id }, select: { id: true, campaignId: true, slotId: true, brandEmail: true } })
    : null;
  await prisma.supportTicket.create({
    data: {
      kind: type.startsWith("dispute") ? "payment_dispute" : "payment_refund",
      campaignId: bid?.campaignId ?? null,
      slotId: bid?.slotId ?? null,
      paymentId: data.payment_id ?? null,
      email: bid?.brandEmail ?? appConfig.supportEmail,
      body: `${marker} Dodo event ${type}. payment=${data.payment_id ?? "?"} refund=${data.refund_id ?? "-"} dispute=${data.dispute_id ?? "-"} status=${data.dispute_status ?? "-"}. Review the slot and reconcile the ledger by hand.`,
    },
  });
}

/** payment.succeeded for a Stake top-up: verify, then credit idempotently (one ledger row per payment id). */
async function creditStakeTopup(data: DodoEventData): Promise<{ credited: boolean; reason?: string }> {
  const meta = data.metadata ?? {};
  const amountCents = Number(meta.amount_cents);
  if (!meta.campaign_id || !meta.creator_id || !data.payment_id || !Number.isInteger(amountCents) || amountCents <= 0) {
    return { credited: false, reason: "bad_metadata" };
  }
  const check = checkPaymentCoversBid(
    { totalAmount: data.total_amount, currency: data.currency },
    { amountCents, currency: meta.currency || "USD" },
  );
  if (!check.ok) return { credited: false, reason: check.reason };
  const campaign = await prisma.campaign.findUnique({ where: { id: meta.campaign_id }, include: { creator: true } });
  if (!campaign || campaign.creatorId !== meta.creator_id) return { credited: false, reason: "unknown_campaign" };
  if (campaign.status === "closed" || campaign.status === "fulfilled") {
    // Stake was already settled; crediting now would strand the money. Flag it for a manual refund.
    await recordPaymentIncident("stake_topup.after_settlement", data, `stake-late:${data.payment_id}`);
    return { credited: false, reason: "campaign_settled" };
  }
  await depositStake({
    campaignId: campaign.id,
    creatorId: campaign.creatorId,
    creatorEmail: campaign.creator.email,
    amountCents,
    paymentId: data.payment_id,
  });
  return { credited: true };
}

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const rawBody = await req.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (provider === "dodo") {
    if (!appConfig.dodoWebhookSecret) {
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }
    if (!verifyDodoSignature(rawBody, req.headers, appConfig.dodoWebhookSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const type = (payload as { type?: string }).type ?? "";
    const meta = (payload as { data?: DodoEventData }).data;
    if (type === "payment.succeeded" && meta?.metadata?.kind === "stake_topup") {
      const result = await creditStakeTopup(meta);
      if (!result.credited) {
        // 200 so Dodo stops retrying; the payment id and reason are in the log for reconciliation.
        console.error("dodo webhook: stake top-up not credited", { paymentId: meta.payment_id, reason: result.reason });
      }
      return NextResponse.json({ received: true, credited: result.credited });
    }
    if (type.startsWith("dispute.") || type.startsWith("refund.")) {
      if (meta) await recordPaymentIncident(type, meta, req.headers.get("webhook-id"));
      return NextResponse.json({ received: true });
    }
    if (type === "payment.succeeded" && meta?.metadata?.bid_id) {
      const bid = await prisma.bid.findUnique({
        where: { id: meta.metadata.bid_id },
        include: { campaign: { select: { currency: true } } },
      });
      if (bid) {
        const check = checkPaymentCoversBid(
          { totalAmount: meta.total_amount, currency: meta.currency },
          { amountCents: bid.amountCents, currency: bid.campaign.currency },
        );
        if (!check.ok) {
          // 200 so Dodo stops retrying; the bid stays in `intent` for an operator to refund or reconcile.
          console.error("dodo webhook: payment does not cover bid", { bidId: bid.id, paymentId: meta.payment_id, reason: check.reason });
          return NextResponse.json({ received: true, settled: false, reason: check.reason });
        }
        if (check.converted) {
          console.warn("dodo webhook: payment currency differs from campaign currency", { bidId: bid.id, paymentId: meta.payment_id });
        }
      }
      await settleFromWebhook(meta.metadata.bid_id, meta.payment_id ?? "dodo");
    }
    return NextResponse.json({ received: true });
  }

  if (provider === "stripe") {
    if (!appConfig.stripeWebhookSecret) {
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }
    if (!verifyStripeSignature(rawBody, req.headers, appConfig.stripeWebhookSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const type = (payload as { type?: string }).type;
    const dataObj = (
      payload as {
        data?: {
          object?: {
            id?: string;
            metadata?: Record<string, string>;
            client_reference_id?: string;
          };
        };
      }
    ).data?.object;

    if (type === "checkout.session.completed" || type === "payment_intent.succeeded") {
      const bidId = dataObj?.metadata?.bid_id ?? dataObj?.metadata?.bidId ?? dataObj?.client_reference_id;
      if (bidId) {
        await settleFromWebhook(bidId, dataObj?.id ?? "stripe");
      }
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
}
