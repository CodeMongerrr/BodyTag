import { NextResponse } from "next/server";
import type { Prisma } from "@bodytag/db";
import { sanitizeAvatarMeta } from "@bodytag/shared";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { publishCampaign } from "@/lib/redis";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth" }, { status: 401 });
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign || campaign.creatorId !== session.userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as {
    objectKey: string;
    label: string;
    width?: number;
    height?: number;
    kind?: string;
    meta?: unknown;
  };
  if (typeof body.objectKey !== "string" || !body.objectKey || body.objectKey.startsWith("procedural:")) {
    return NextResponse.json({ error: "objectKey required" }, { status: 400 });
  }
  const kind = body.kind ?? "photo";
  // A body must be one of our own GLB uploads (avatar/… from the Avaturn flow, glb/… from manual upload).
  if (kind === "glb" && !/^(avatar|glb)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.glb$/.test(body.objectKey)) {
    return NextResponse.json({ error: "objectKey must be an uploaded .glb" }, { status: 400 });
  }
  const meta = (sanitizeAvatarMeta(body.meta) ?? undefined) as Prisma.InputJsonValue | undefined;

  // An arena has exactly one body. Replace it in place so the slots (FK surfaceId, cascade) survive.
  // Pick the same surface the renderer shows: the last real GLB, else the seeded placeholder.
  if (kind === "glb") {
    const glbs = await prisma.surface.findMany({ where: { campaignId: id, kind: "glb" }, orderBy: { sortOrder: "asc" } });
    const existing = glbs.filter((s) => !s.objectKey.startsWith("procedural:")).pop() ?? glbs[0];
    if (existing) {
      const surface = await prisma.surface.update({
        where: { id: existing.id },
        data: { objectKey: body.objectKey, label: body.label || existing.label, meta: meta ?? { source: "upload" } },
      });
      await publishCampaign(id, { type: "update" });
      return NextResponse.json(surface);
    }
  }

  const count = await prisma.surface.count({ where: { campaignId: id } });
  const surface = await prisma.surface.create({
    data: {
      campaignId: id,
      objectKey: body.objectKey,
      label: body.label || `surface-${count + 1}`,
      kind,
      width: body.width,
      height: body.height,
      sortOrder: count,
      meta: kind === "glb" ? (meta ?? { source: "upload" }) : undefined,
    },
  });
  await publishCampaign(id, { type: "update" });
  return NextResponse.json(surface);
}
