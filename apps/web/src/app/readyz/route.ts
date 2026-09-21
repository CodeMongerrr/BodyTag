import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redisPing } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  const redis = await redisPing();
  const ok = db && redis;
  return NextResponse.json({ ok, db, redis }, { status: ok ? 200 : 503 });
}
