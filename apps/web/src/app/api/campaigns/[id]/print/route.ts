import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import JSZip from "jszip";
import { getObject } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth" }, { status: 401 });
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      slots: {
        include: { bids: { where: { status: "settled" }, include: { creative: true }, take: 1, orderBy: { settledAt: "desc" } } },
      },
    },
  });
  if (!campaign || campaign.creatorId !== session.userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const zip = new JSZip();
  zip.file(
    "placement.txt",
    campaign.slots
      .map((s) => {
        const bid = s.bids[0];
        return `${s.name}\t${s.sizeNote ?? ""}\t${s.hyroxCm ?? ""}cm\t${bid?.brandName ?? "unsold"}\t${bid?.creative?.url ?? ""}`;
      })
      .join("\n"),
  );
  for (const slot of campaign.slots) {
    const bid = slot.bids[0];
    if (!bid?.creative?.logoKey) continue;
    try {
      const buf = await getObject(bid.creative.logoKey);
      zip.file(`logos/${slot.name.replace(/\s+/g, "-")}-${bid.brandName}.png`, buf);
    } catch {
      /* skip */
    }
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${campaign.slug}-print-pack.zip"`,
    },
  });
}
