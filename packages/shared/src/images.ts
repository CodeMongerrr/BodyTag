import sharp from "sharp";

export type SlotRect = { x: number; y: number; w: number; h: number };

export type LogoSlot = {
  rect: SlotRect;
  logo: Buffer;
  name?: string;
};

const DECODE = { failOn: "none" as const, sequential: true };

async function asPng(buf: Buffer, width?: number, height?: number) {
  try {
    let pipeline = sharp(buf, DECODE);
    if (width && height) {
      pipeline = pipeline.resize(width, height, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    }
    return await pipeline.png().toBuffer();
  } catch {
    return null;
  }
}

export async function compositePhoto(base: Buffer, slots: LogoSlot[]) {
  const decoded = (await asPng(base)) ?? base;
  const image = sharp(decoded, DECODE);
  const meta = await image.metadata();
  const w = meta.width ?? 900;
  const h = meta.height ?? 1400;
  const overlays: sharp.OverlayOptions[] = [];
  for (const slot of slots) {
    const tw = Math.max(8, Math.round(slot.rect.w * w));
    const th = Math.max(8, Math.round(slot.rect.h * h));
    const logo = await asPng(slot.logo, tw, th);
    if (!logo) continue;
    overlays.push({
      input: logo,
      left: Math.round(slot.rect.x * w),
      top: Math.round(slot.rect.y * h),
    });
  }
  return image.composite(overlays).png().toBuffer();
}

export async function cropSlot(base: Buffer, rect: SlotRect) {
  const meta = await sharp(base).metadata();
  const w = meta.width ?? 900;
  const h = meta.height ?? 1400;
  return sharp(base)
    .extract({
      left: Math.max(0, Math.round(rect.x * w)),
      top: Math.max(0, Math.round(rect.y * h)),
      width: Math.max(8, Math.round(rect.w * w)),
      height: Math.max(8, Math.round(rect.h * h)),
    })
    .png()
    .toBuffer();
}

async function letterbox(src: Buffer, w: number, h: number, bg: { r: number; g: number; b: number }) {
  return sharp(src)
    .resize(w, h, { fit: "contain", background: { ...bg, alpha: 1 } })
    .png()
    .toBuffer();
}

export async function makeOg(composite: Buffer, title: string, raised: string) {
  const body = await sharp(composite)
    .resize(720, 630, { fit: "cover" })
    .png()
    .toBuffer();
  const svg = Buffer.from(`
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#070707"/>
      <text x="48" y="72" font-family="sans-serif" font-size="22" fill="#d6ff3c">BODYTAG</text>
      <text x="48" y="150" font-family="sans-serif" font-size="42" fill="#f4f0e7">${escapeXml(title.slice(0, 42))}</text>
      <text x="48" y="210" font-family="monospace" font-size="28" fill="#f4f0e7">${escapeXml(raised)} raised</text>
      <text x="48" y="580" font-family="sans-serif" font-size="18" fill="#8a867c">Live auction · numbered ad slots · not a bet</text>
    </svg>`);
  return sharp(svg)
    .composite([{ input: body, left: 480, top: 0 }])
    .png()
    .toBuffer();
}

export async function makeSquare(composite: Buffer) {
  return letterbox(composite, 1080, 1080, { r: 7, g: 7, b: 7 });
}

export async function makeStory(composite: Buffer) {
  return letterbox(composite, 1080, 1920, { r: 7, g: 7, b: 7 });
}

export async function makePrint(composite: Buffer) {
  return sharp(composite).resize(2400, 3600, { fit: "inside" }).png().toBuffer();
}

export async function makeArenaCard(opts: {
  title: string;
  slots: { name: string; logo?: Buffer; price: string }[];
}) {
  const tiles: sharp.OverlayOptions[] = [];
  let i = 0;
  for (const slot of opts.slots.slice(0, 8)) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 80 + col * 270;
    const y = 220 + row * 280;
    if (slot.logo) {
      const logo = await asPng(slot.logo, 180, 180);
      if (logo) tiles.push({ input: logo, left: x, top: y });
    }
    i += 1;
  }
  const svg = Buffer.from(`
    <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="900" fill="#0b0a09"/>
      <text x="60" y="80" font-family="sans-serif" font-size="20" fill="#d6ff3c">ARENA SNAPSHOT</text>
      <text x="60" y="140" font-family="sans-serif" font-size="36" fill="#f4f0e7">${escapeXml(opts.title.slice(0, 48))}</text>
    </svg>`);
  return sharp(svg).composite(tiles).png().toBuffer();
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
