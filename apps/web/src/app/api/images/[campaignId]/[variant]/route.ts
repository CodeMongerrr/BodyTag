import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { ensureVariant } from "@/lib/queue";
import { IMAGE_VARIANTS } from "@bodytag/shared";

export async function GET(req: Request, { params }: { params: Promise<{ campaignId: string; variant: string }> }) {
  const { campaignId, variant } = await params;
  // Only real variants: the lazy path below creates a job row per unknown (campaign, variant) pair.
  if (!(IMAGE_VARIANTS as readonly string[]).includes(variant)) {
    return NextResponse.json({ error: "unknown variant" }, { status: 404 });
  }
  const done = await prisma.imageJob.findFirst({
    where: { campaignId, variant, status: "done" },
    orderBy: { updatedAt: "desc" },
  });
  let job = done;
  if (!job?.outputKey) {
    try {
      job = await ensureVariant(campaignId, variant);
    } catch {
      return NextResponse.json({ error: "image unavailable" }, { status: 503 });
    }
  }
  if (!job.outputKey) {
    // Render is still queued (hosted instance renders asynchronously): show the placeholder, uncached, so the
    // storefront <img> and marketplace grid pick up the real image on the next load.
    return NextResponse.redirect(new URL("/og-placeholder.png", req.url), {
      status: 302,
      headers: { "cache-control": "no-store" },
    });
  }
  try {
    const buf = await getObject(job.outputKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=30, s-maxage=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "missing object" }, { status: 404 });
  }
}
