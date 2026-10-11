import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/redis";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { slotId?: string };
  const slotId = body.slotId;
  if (!slotId || typeof slotId !== "string") return NextResponse.json({ ok: false }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // Views are a vanity counter; throttle per visitor+slot so it cannot be inflated by a loop.
  if (!(await checkRateLimit(`ratelimit:view:${ip}:${slotId}`, 3, 60))) return NextResponse.json({ ok: true, counted: false });
  // Only count views on slots of campaigns that are public (never drafts) and ignore unknown ids instead of 500ing.
  const result = await prisma.slot.updateMany({
    where: { id: slotId, campaign: { status: { not: "draft" } } },
    data: { viewCount: { increment: 1 } },
  });
  return NextResponse.json({ ok: true, counted: result.count > 0 });
}
