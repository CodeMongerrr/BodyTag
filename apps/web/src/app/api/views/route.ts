import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allowByIp } from "@/lib/http";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { slotId?: unknown } | null;
  const slotId = typeof body?.slotId === "string" ? body.slotId : "";
  if (!slotId || slotId.length > 64) return NextResponse.json({ ok: false }, { status: 400 });
  // View counts are public; keep one visitor from inflating a slot.
  if (!(await allowByIp(req.headers, `view:${slotId}`, 10, 60))) {
    return NextResponse.json({ ok: true, counted: false });
  }
  // updateMany: an unknown slot id is a no-op instead of a 500.
  const res = await prisma.slot.updateMany({
    where: { id: slotId },
    data: { viewCount: { increment: 1 } },
  });
  return NextResponse.json({ ok: res.count > 0, counted: res.count > 0 });
}
