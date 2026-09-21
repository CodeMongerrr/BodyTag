import { NextResponse } from "next/server";
import { settleBid } from "@/lib/bids";
import { prisma } from "@/lib/db";
import { appConfig } from "@/lib/config";

export async function GET(req: Request) {
  if (appConfig.paymentProvider !== "mock" || !appConfig.allowMockPayments) {
    return NextResponse.json({ error: "Mock payments disabled" }, { status: 403 });
  }
  const url = new URL(req.url);
  const bidId = url.searchParams.get("bid");
  if (!bidId) return NextResponse.json({ error: "bid required" }, { status: 400 });
  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: { campaign: { include: { creator: true } } },
  });
  if (!bid) return NextResponse.json({ error: "unknown bid" }, { status: 404 });
  await settleBid({ bidId: bid.id, paymentId: `mock_${bid.id}` });
  return NextResponse.redirect(
    `${appConfig.appUrl}/@${bid.campaign.creator.handle}/${bid.campaign.slug}?bid=ok&slot=${bid.slotId}`,
  );
}

export async function POST(req: Request) {
  if (appConfig.paymentProvider !== "mock" || !appConfig.allowMockPayments) {
    return NextResponse.json({ error: "Mock payments disabled" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { bidId?: string };
  if (!body.bidId) return NextResponse.json({ error: "bidId required" }, { status: 400 });
  const bid = await prisma.bid.findUnique({ where: { id: body.bidId } });
  if (!bid) return NextResponse.json({ error: "unknown bid" }, { status: 404 });
  await settleBid({ bidId: body.bidId, paymentId: `mock_${body.bidId}` });
  return NextResponse.json({ ok: true });
}
