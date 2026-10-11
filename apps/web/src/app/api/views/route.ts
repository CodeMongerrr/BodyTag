import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allowByIp } from "@/lib/http";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { slotId?: unknown } | null;
  const slotId = typeof body?.slotId === "string" ? body.slotId : "";
  if (!slotId || slotId.length > 64) return NextResponse.json({ ok: false }, { status: 400 });
  // Views are a vanity counter; throttle per visitor+slot so it cannot be inflated by a loop.
  if (!(await allowByIp(req.headers, `view:${slotId}`, 5, 60))) return NextResponse.json({ ok: true, counted: false });
  // Only count views on slots of campaigns that are public (never drafts) and ignore unknown ids instead of 500ing.
  const result = await prisma.slot.updateMany({
    where: { id: slotId, campaign: { status: { not: "draft" } } },
    data: { viewCount: { increment: 1 } },
  });
  return NextResponse.json({ ok: true, counted: result.count > 0 });
}
