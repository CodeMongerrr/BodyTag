import { NextResponse } from "next/server";
import { getCampaignById, serializeCampaign } from "@/lib/campaigns";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  // Drafts are private to their creator (the public page 404s them too).
  if (campaign.status === "draft") {
    const session = await getSession();
    if (session?.userId !== campaign.creatorId) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
  }
  return NextResponse.json(serializeCampaign(campaign));
}
