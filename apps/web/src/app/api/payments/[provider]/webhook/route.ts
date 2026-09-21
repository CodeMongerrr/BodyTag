import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { settleBid } from "@/lib/bids";
import { appConfig } from "@/lib/config";

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

    const type = (payload as { type?: string }).type;
    const meta = (payload as { data?: { metadata?: Record<string, string>; payment_id?: string } }).data;
    if (type === "payment.succeeded" && meta?.metadata?.bid_id) {
      await settleBid({ bidId: meta.metadata.bid_id, paymentId: meta.payment_id ?? "dodo" });
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
        await settleBid({ bidId, paymentId: dataObj?.id ?? "stripe" });
      }
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
}
