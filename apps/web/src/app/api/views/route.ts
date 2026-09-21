import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const { slotId } = (await req.json()) as { slotId?: string };
  if (!slotId) return NextResponse.json({ ok: false }, { status: 400 });
  await prisma.slot.update({
    where: { id: slotId },
    data: { viewCount: { increment: 1 } },
  });
  return NextResponse.json({ ok: true });
}
