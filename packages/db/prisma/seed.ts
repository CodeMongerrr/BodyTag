import { PrismaClient } from "@prisma/client";
import { DEFAULT_ARENA_SLOTS } from "@bodytag/shared";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

const FRONT_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1400" viewBox="0 0 900 1400">
  <rect width="900" height="1400" fill="#12110f"/>
  <rect x="40" y="40" width="820" height="1320" rx="8" fill="none" stroke="#d6ff3c" stroke-width="2" opacity="0.25"/>
  <ellipse cx="450" cy="210" rx="78" ry="92" fill="#e8d7c4"/>
  <rect x="372" y="292" width="156" height="40" rx="20" fill="#e8d7c4"/>
  <path d="M300 340 L600 340 L640 820 L260 820 Z" fill="#1f3d2a"/>
  <path d="M300 340 L450 390 L600 340" fill="#2d5a3a"/>
  <rect x="330" y="820" width="90" height="380" fill="#c4b5a0"/>
  <rect x="480" y="820" width="90" height="380" fill="#c4b5a0"/>
  <text x="450" y="1340" text-anchor="middle" fill="#d6ff3c" font-family="monospace" font-size="22">FRONT</text>
</svg>`;

const BACK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1400" viewBox="0 0 900 1400">
  <rect width="900" height="1400" fill="#12110f"/>
  <rect x="40" y="40" width="820" height="1320" rx="8" fill="none" stroke="#d6ff3c" stroke-width="2" opacity="0.25"/>
  <ellipse cx="450" cy="210" rx="78" ry="92" fill="#e8d7c4"/>
  <rect x="372" y="292" width="156" height="40" rx="20" fill="#e8d7c4"/>
  <path d="M300 340 L600 340 L640 820 L260 820 Z" fill="#163024"/>
  <rect x="330" y="820" width="90" height="380" fill="#c4b5a0"/>
  <rect x="480" y="820" width="90" height="380" fill="#c4b5a0"/>
  <text x="450" y="1340" text-anchor="middle" fill="#d6ff3c" font-family="monospace" font-size="22">BACK</text>
</svg>`;

async function putObject(key: string, buf: Buffer) {
  const dir = path.resolve(process.cwd(), "../../data/objects");
  const full = path.join(dir, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
}

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const eventDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 28);
  const closeAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2);

  const mara = await prisma.user.upsert({
    where: { email: "mara@demo.bodytag" },
    update: {},
    create: {
      email: "mara@demo.bodytag",
      handle: "mara",
      name: "Mara Devi",
      passwordHash,
      phone: "+15555550100",
      kycTier: 2,
      verified: true,
      socialX: "mara_runs",
      processor: "mock",
    },
  });

  await prisma.user.upsert({
    where: { email: "brand@demo.bodytag" },
    update: {},
    create: {
      email: "brand@demo.bodytag",
      handle: "acmeads",
      name: "Acme Ads",
      passwordHash,
      kycTier: 0,
      processor: "mock",
    },
  });

  const front = await sharp(Buffer.from(FRONT_SVG)).png().toBuffer();
  const back = await sharp(Buffer.from(BACK_SVG)).png().toBuffer();
  await putObject("seed/mara-front.png", front);
  await putObject("seed/mara-back.png", back);

  let photo = await prisma.campaign.findFirst({
    where: { creatorId: mara.id, slug: "hyrox-mumbai" },
  });
  if (!photo) {
    photo = await prisma.campaign.create({
      data: {
        creatorId: mara.id,
        slug: "hyrox-mumbai",
        title: "HYROX Mumbai — walking billboard",
        theme: "photo",
        status: "draft",
        eventName: "HYROX Mumbai",
        eventDate,
        eventCity: "Mumbai",
        closeAt,
        targetTotalCents: 920_000,
        shortCode: "mara1",
        previewSecret: "preview-mara-photo",
        socialLinks: { x: "https://x.com/mara_runs" },
        vetoList: ["competitor-sports-drink"],
      },
    });
    const sFront = await prisma.surface.create({
      data: {
        campaignId: photo.id,
        kind: "photo",
        objectKey: "seed/mara-front.png",
        label: "front",
        sortOrder: 0,
        width: 900,
        height: 1400,
      },
    });
    const sBack = await prisma.surface.create({
      data: {
        campaignId: photo.id,
        kind: "photo",
        objectKey: "seed/mara-back.png",
        label: "back",
        sortOrder: 1,
        width: 900,
        height: 1400,
      },
    });
    await prisma.slot.createMany({
      data: [
        { campaignId: photo.id, surfaceId: sFront.id, name: "Mega Spot", startPriceCents: 120_000, currentPriceCents: 120_000, rect: { x: 0.32, y: 0.28, w: 0.36, h: 0.16 }, sizeNote: "Chest print", hyroxCm: 32, sortOrder: 0 },
        { campaignId: photo.id, surfaceId: sFront.id, name: "Heart", startPriceCents: 80_000, currentPriceCents: 80_000, rect: { x: 0.42, y: 0.34, w: 0.16, h: 0.1 }, hyroxCm: 20, sortOrder: 1 },
        { campaignId: photo.id, surfaceId: sFront.id, name: "Mini left", startPriceCents: 35_000, currentPriceCents: 35_000, rect: { x: 0.22, y: 0.48, w: 0.18, h: 0.1 }, hyroxCm: 20, sortOrder: 2 },
        { campaignId: photo.id, surfaceId: sFront.id, name: "Mini right", startPriceCents: 35_000, currentPriceCents: 35_000, rect: { x: 0.6, y: 0.48, w: 0.18, h: 0.1 }, hyroxCm: 20, sortOrder: 3 },
        { campaignId: photo.id, surfaceId: sBack.id, name: "Back banner", startPriceCents: 90_000, currentPriceCents: 90_000, rect: { x: 0.3, y: 0.36, w: 0.4, h: 0.18 }, hyroxCm: 32, sortOrder: 4 },
        { campaignId: photo.id, surfaceId: sBack.id, name: "Hamstring L", startPriceCents: 40_000, currentPriceCents: 40_000, rect: { x: 0.34, y: 0.62, w: 0.14, h: 0.12 }, hyroxCm: 20, sortOrder: 5 },
      ],
    });
  }

  let arena = await prisma.campaign.findFirst({
    where: { creatorId: mara.id, slug: "arena-demo" },
  });
  if (!arena) {
    arena = await prisma.campaign.create({
      data: {
        creatorId: mara.id,
        slug: "arena-demo",
        title: "Ares arena — 3D body slots",
        theme: "arena",
        status: "draft",
        eventName: "HYROX Mumbai",
        eventDate,
        eventCity: "Mumbai",
        closeAt,
        shortCode: "mara3d",
        previewSecret: "preview-mara-arena",
        arenaConfig: {
          theme: "neon",
          soundtrack: true,
          soundtrackMutedMobile: true,
          reducedMotion: false,
          showGrid: true,
          showHdri: false,
          showTicker: true,
          markerStyle: "filled",
          maxDecalCm: 32,
          startCamera: "front",
          rewindEnabled: true,
        },
      },
    });
    const body = await prisma.surface.create({
      data: {
        campaignId: arena.id,
        kind: "glb",
        objectKey: "procedural:mannequin",
        label: "body",
        sortOrder: 0,
      },
    });
    await prisma.slot.createMany({
      data: DEFAULT_ARENA_SLOTS.map((s, i) => ({
        campaignId: arena.id,
        surfaceId: body.id,
        name: s.name,
        startPriceCents: s.startPriceCents,
        currentPriceCents: s.startPriceCents,
        marker: s.marker,
        hyroxCm: s.hyroxCm,
        sortOrder: i,
      })),
    });
  }

  console.log("Seeded mara@demo.bodytag / demo1234");
  console.log("Photo draft: /@mara/hyrox-mumbai (publish after Stake)");
  console.log("Arena draft: /@mara/arena-demo");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
