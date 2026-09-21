// Port of apps/web/src/lib/images/process.ts for Workers: identical DB reads/writes, output keys and
// status transitions, but the raster work goes through @bodytag/shared/images-svg + resvg instead of sharp.
import {
  arenaCardSvg,
  compositePhotoSvg,
  ogSvg,
  printSvg,
  slotCropSvg,
  squareSvg,
  storySvg,
  type SlotRect,
} from "@bodytag/shared/images-svg";
import { formatMoney } from "@bodytag/shared";
import type { Db } from "./db";
import { renderPng } from "./render";
import type { Storage } from "./storage";

export type ProcessDeps = { prisma: Db; storage: Storage };

export async function processImageJob(imageJobId: string, { prisma, storage }: ProcessDeps) {
  const job = await prisma.imageJob.update({
    where: { id: imageJobId },
    data: { status: "running" },
  });
  try {
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: job.campaignId },
      include: {
        surfaces: true,
        slots: { orderBy: { sortOrder: "asc" }, include: { bids: { where: { status: "settled" }, include: { creative: true }, orderBy: { settledAt: "desc" }, take: 1 } } },
        creator: true,
      },
    });

    const surface = campaign.surfaces.sort((a, b) => a.sortOrder - b.sortOrder)[0];
    let composite: string;
    if (campaign.theme === "photo" && surface && !surface.objectKey.startsWith("procedural:")) {
      const base = await storage.getObject(surface.objectKey);
      const logos: { rect: SlotRect; logo: Uint8Array }[] = [];
      for (const slot of campaign.slots.filter((s) => s.surfaceId === surface.id)) {
        const bid = slot.bids[0];
        if (!bid?.creative?.logoKey || !slot.rect) continue;
        try {
          const logo = await storage.getObject(bid.creative.logoKey);
          logos.push({ rect: slot.rect as SlotRect, logo });
        } catch {
          /* skip missing logo */
        }
      }
      composite = compositePhotoSvg({ base, logos });
    } else {
      const tiles = [];
      for (const slot of campaign.slots) {
        const bid = slot.bids[0];
        let logo: Uint8Array | undefined;
        if (bid?.creative?.logoKey) {
          try {
            logo = await storage.getObject(bid.creative.logoKey);
          } catch {
            logo = undefined;
          }
        }
        tiles.push({
          name: slot.name,
          logo,
          price: formatMoney(slot.currentPriceCents, campaign.currency),
        });
      }
      composite = arenaCardSvg({ title: campaign.title, slots: tiles });
    }

    let svg: string;
    if (job.variant === "og") svg = ogSvg({ title: campaign.title, raised: formatMoney(campaign.gmvCents || campaign.raisedCents, campaign.currency), composite });
    else if (job.variant === "square") svg = squareSvg(composite);
    else if (job.variant === "story") svg = storySvg(composite);
    // Workers have 128 MB: a 2400x3600 RGBA raster alone is 35 MB, so the hosted print pack renders at half size.
    else if (job.variant === "print") svg = printSvg(composite, 1200, 1800);
    else if (job.variant === "slot_crop" && surface && !surface.objectKey.startsWith("procedural:")) {
      const slot = campaign.slots.find((s) => s.rect);
      const base = await storage.getObject(surface.objectKey);
      svg = slot?.rect ? slotCropSvg(base, slot.rect as SlotRect) : composite;
    } else svg = composite;
    const out = await renderPng(svg);

    const key = `images/${campaign.id}/${job.variant}-${job.id}.png`;
    await storage.putObject(key, out, "image/png");
    await prisma.imageJob.update({
      where: { id: job.id },
      data: { status: "done", outputKey: key, error: null },
    });
  } catch (e) {
    await prisma.imageJob.update({
      where: { id: job.id },
      data: { status: "failed", error: e instanceof Error ? e.message : "render failed" },
    });
    throw e;
  }
}
