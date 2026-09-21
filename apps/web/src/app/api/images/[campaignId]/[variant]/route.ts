import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { ensureVariant } from "@/lib/queue";

export async function GET(req: Request, { params }: { params: Promise<{ campaignId: string; variant: string }> }) {
  const { campaignId, variant } = await params;
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
