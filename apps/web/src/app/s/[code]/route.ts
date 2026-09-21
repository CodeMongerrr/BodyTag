import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appConfig } from "@/lib/config";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { shortCode: code },
    include: { creator: true },
  });
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(`${appConfig.appUrl}/@${campaign.creator.handle}/${campaign.slug}`);
}
