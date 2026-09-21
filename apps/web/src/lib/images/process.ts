import {
  compositePhoto,
  cropSlot,
  makeArenaCard,
  makeOg,
  makePrint,
  makeSquare,
  makeStory,
  type SlotRect,
} from "@bodytag/shared/images";
import { formatMoney } from "@bodytag/shared";
import { prisma } from "../db";
import { getObject, putObject } from "../storage";

export async function processImageJob(imageJobId: string) {
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
    let composite: Buffer;
    if (campaign.theme === "photo" && surface && !surface.objectKey.startsWith("procedural:")) {
      const base = await getObject(surface.objectKey);
      const logos: { rect: SlotRect; logo: Buffer }[] = [];
      for (const slot of campaign.slots.filter((s) => s.surfaceId === surface.id)) {
        const bid = slot.bids[0];
        if (!bid?.creative?.logoKey || !slot.rect) continue;
        try {
          const logo = await getObject(bid.creative.logoKey);
          logos.push({ rect: slot.rect as SlotRect, logo });
        } catch {
          /* skip missing logo */
        }
      }
      composite = await compositePhoto(base, logos);
    } else {
      const tiles = [];
      for (const slot of campaign.slots) {
        const bid = slot.bids[0];
        let logo: Buffer | undefined;
        if (bid?.creative?.logoKey) {
          try {
            logo = await getObject(bid.creative.logoKey);
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
      composite = await makeArenaCard({ title: campaign.title, slots: tiles });
    }

    let out: Buffer;
    if (job.variant === "og") out = await makeOg(composite, campaign.title, formatMoney(campaign.gmvCents || campaign.raisedCents, campaign.currency));
    else if (job.variant === "square") out = await makeSquare(composite);
    else if (job.variant === "story") out = await makeStory(composite);
    else if (job.variant === "print") out = await makePrint(composite);
    else if (job.variant === "slot_crop" && surface && !surface.objectKey.startsWith("procedural:")) {
      const slot = campaign.slots.find((s) => s.rect);
      const base = await getObject(surface.objectKey);
      out = slot?.rect ? await cropSlot(base, slot.rect as SlotRect) : composite;
    } else out = composite;

    const key = `images/${campaign.id}/${job.variant}-${job.id}.png`;
    await putObject(key, out, "image/png");
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
