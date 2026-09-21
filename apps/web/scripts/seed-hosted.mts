/**
 * Hosted-demo seed: run after `pnpm db:seed` against the hosted database, with the demo bodies already in R2.
 *   DATABASE_URL=<neon> ../../packages/db/node_modules/.bin/tsx --tsconfig tsconfig.json scripts/seed-hosted.mts
 * Attaches the Avaturn demo bodies (avatar/seed/man.glb, avatar/seed/woman.glb), adds the female arena,
 * deposits Stake and opens both arenas for bidding. Idempotent.
 */
import { prisma } from "@/lib/db";
import { depositStake } from "@/lib/stake";
import { DEFAULT_ARENA_SLOTS, defaultArenaConfig } from "@bodytag/shared";
import type { Prisma } from "@bodytag/db";

const NEON_ARENA = { ...defaultArenaConfig, theme: "neon" as const };
const WEEK = 7 * 86400_000;

async function ensureArena(creatorId: string, opts: { slug: string; title: string; shortCode: string; previewSecret: string; body: string; meta: Prisma.InputJsonValue }) {
  let camp = await prisma.campaign.findFirst({ where: { creatorId, slug: opts.slug }, include: { surfaces: true, slots: true } });
  if (!camp) {
    const created = await prisma.campaign.create({
      data: {
        creatorId, slug: opts.slug, title: opts.title, theme: "arena", status: "draft",
        eventName: "HYROX Mumbai", eventCity: "Mumbai", eventDate: new Date(Date.now() + 4 * WEEK), closeAt: new Date(Date.now() + WEEK),
        currency: "USD", shortCode: opts.shortCode, previewSecret: opts.previewSecret,
        arenaConfig: NEON_ARENA as unknown as Prisma.InputJsonValue,
      },
    });
    const surface = await prisma.surface.create({ data: { campaignId: created.id, kind: "glb", objectKey: "procedural:mannequin", label: "body" } });
    await prisma.slot.createMany({
      data: DEFAULT_ARENA_SLOTS.map((s, i) => ({
        campaignId: created.id, surfaceId: surface.id, name: s.name, startPriceCents: s.startPriceCents, currentPriceCents: s.startPriceCents,
        marker: s.marker as Prisma.InputJsonValue, hyroxCm: s.hyroxCm, sortOrder: i,
      })),
    });
    camp = await prisma.campaign.findFirstOrThrow({ where: { id: created.id }, include: { surfaces: true, slots: true } });
  }
  const body = camp.surfaces.find((s) => s.kind === "glb") ?? camp.surfaces[0];
  await prisma.surface.update({ where: { id: body.id }, data: { objectKey: opts.body, meta: opts.meta } });
  await prisma.campaign.update({
    where: { id: camp.id },
    data: { status: "live", closeAt: new Date(Date.now() + WEEK), pausedReason: null, arenaConfig: { ...(camp.arenaConfig as object), theme: "neon" } },
  });
  return camp;
}

async function main() {
  const mara = await prisma.user.findUniqueOrThrow({ where: { email: "mara@demo.bodytag" } });
  const him = await ensureArena(mara.id, {
    slug: "arena-demo", title: "Sponsor my race — logos on the body", shortCode: "mara3d", previewSecret: "preview-mara-arena",
    body: "avatar/seed/man.glb", meta: { source: "avaturn", avatarId: "example-t1", gender: "male", bodyId: "body_0", rig: "mixamo_T" },
  });
  const her = await ensureArena(mara.id, {
    slug: "arena-demo-her", title: "Sponsor her race — logos on the kit", shortCode: "maraher", previewSecret: "preview-mara-her",
    body: "avatar/seed/woman.glb", meta: { source: "avaturn", avatarId: "template-female", gender: "female", bodyId: "body_1", rig: "mixamo_T" },
  });
  for (const c of [him, her]) {
    const stake = await prisma.stake.findFirst({ where: { campaignId: c.id } });
    if (!stake || stake.amountCents < 50_000) {
      await depositStake({ campaignId: c.id, creatorId: mara.id, creatorEmail: mara.email, amountCents: 50_000 - (stake?.amountCents ?? 0) });
    }
    const fin = await prisma.campaign.findUniqueOrThrow({ where: { id: c.id }, include: { stakes: true, slots: true, surfaces: true } });
    console.log(`/@mara/${fin.slug}  status=${fin.status} slots=${fin.slots.length} body=${fin.surfaces[0].objectKey} stake=$${(fin.stakes[0]?.amountCents ?? 0) / 100}`);
  }
  await prisma.$disconnect();
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
