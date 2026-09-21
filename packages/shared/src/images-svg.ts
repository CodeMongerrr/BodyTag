/**
 * Dependency-free SVG builders mirroring ./images.ts (the sharp pipeline). The hosted instance renders
 * these on Cloudflare Workers through resvg-wasm (apps/worker-images-cf); the self-hosted worker keeps
 * using sharp. Every builder returns a complete `<svg>` document string. Text uses the font-family
 * "BodyTag Sans" and the renderer maps it to whichever TTF it bundles.
 */

export type SlotRect = { x: number; y: number; w: number; h: number };

export type RasterInfo = { width: number; height: number; mime: string };

/** A rendered layer: either an SVG document produced by one of these builders, or raw raster bytes. */
export type Layer = string | Uint8Array;

const DEFAULT_W = 900;
const DEFAULT_H = 1400;
const BG = "#070707";
const FONT = "BodyTag Sans";

// ---------------------------------------------------------------------------------------------------
// Raster sniffing (PNG IHDR / JPEG SOFn / WebP VP8, VP8L, VP8X) — enough to size images without decoding.

function ascii(b: Uint8Array, off: number, len: number) {
  let s = "";
  for (let i = 0; i < len; i += 1) s += String.fromCharCode(b[off + i]);
  return s;
}

export function sniffRaster(bytes: Uint8Array): RasterInfo | null {
  const b = bytes;
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && ascii(b, 12, 4) === "IHDR") {
    const width = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
    const height = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
    return { width, height, mime: "image/png" };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = b[i + 1];
      if (marker === 0xff) {
        i += 1;
        continue;
      }
      // Standalone markers carry no length.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = (b[i + 2] << 8) | b[i + 3];
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = (b[i + 5] << 8) | b[i + 6];
        const width = (b[i + 7] << 8) | b[i + 8];
        return { width, height, mime: "image/jpeg" };
      }
      if (marker === 0xd9 || marker === 0xda) break;
      i += 2 + len;
    }
    return null;
  }
  if (b.length >= 30 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    const chunk = ascii(b, 12, 4);
    if (chunk === "VP8 ") {
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
      const width = (b[26] | (b[27] << 8)) & 0x3fff;
      const height = (b[28] | (b[29] << 8)) & 0x3fff;
      return { width, height, mime: "image/webp" };
    }
    if (chunk === "VP8L") {
      if (b[20] !== 0x2f) return null;
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >>> 14) & 0x3fff) + 1;
      return { width, height, mime: "image/webp" };
    }
    if (chunk === "VP8X") {
      const width = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
      const height = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
      return { width, height, mime: "image/webp" };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Encoding + layer helpers

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes: Uint8Array) {
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(bytes).toString("base64");
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + "=";
  }
  return out;
}

function dataUri(bytes: Uint8Array, mime: string) {
  return `data:${mime};base64,${base64(bytes)}`;
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function num(v: number) {
  return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : "0";
}

/** Width/height declared on the root of an SVG document built here (or any `<svg width=".." height="..">`). */
export function svgSize(doc: string): { width: number; height: number } {
  const open = /<svg\b[^>]*>/.exec(doc);
  const attrs = open?.[0] ?? "";
  const w = /\swidth="([\d.]+)"/.exec(attrs);
  const h = /\sheight="([\d.]+)"/.exec(attrs);
  return { width: w ? Number(w[1]) : DEFAULT_W, height: h ? Number(h[1]) : DEFAULT_H };
}

/** Intrinsic size of a layer, whatever its type. Unknown rasters fall back to the 900x1400 sharp default. */
export function layerSize(layer: Layer): { width: number; height: number } {
  if (typeof layer === "string") return svgSize(layer);
  const info = sniffRaster(layer);
  return info && info.width > 0 && info.height > 0 ? { width: info.width, height: info.height } : { width: DEFAULT_W, height: DEFAULT_H };
}

type Fit = "cover" | "contain";

/**
 * Place a layer inside a box. SVG documents are inlined as nested `<svg>` (resvg refuses to load
 * `<image>`s nested inside an `<image href="data:image/svg+xml">`, so nesting is the only option that
 * keeps the embedded logos); rasters become a data: URI `<image>`.
 */
let clipSeq = 0;

function placeLayer(layer: Layer, box: { x: number; y: number; w: number; h: number }, fit: Fit, align: "center" | "start" = "center") {
  const par = fit === "cover" ? (align === "start" ? "xMinYMid slice" : "xMidYMid slice") : "xMidYMid meet";
  const size = layerSize(layer);
  if (typeof layer === "string") {
    // Nested <svg> viewBox/preserveAspectRatio scaling is not reliable across renderers (resvg included), so
    // the inner document is placed with an explicit transform and clipped to the box.
    const open = /<svg\b[^>]*>/.exec(layer);
    const end = layer.lastIndexOf("</svg>");
    const body = open && end > open.index ? layer.slice(open.index + open[0].length, end) : "";
    const scale = fit === "cover" ? Math.max(box.w / size.width, box.h / size.height) : Math.min(box.w / size.width, box.h / size.height);
    const tx = align === "start" ? box.x : box.x + (box.w - size.width * scale) / 2;
    const ty = box.y + (box.h - size.height * scale) / 2;
    const id = `layer-clip-${clipSeq++}`;
    return (
      `<clipPath id="${id}"><rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}"/></clipPath>` +
      `<g clip-path="url(#${id})"><g transform="translate(${num(tx)} ${num(ty)}) scale(${num(scale)})">${body}</g></g>`
    );
  }
  const mime = sniffRaster(layer)?.mime ?? "image/png";
  return `<image x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" preserveAspectRatio="${par}" href="${dataUri(layer, mime)}"/>`;
}

/** Greedy word wrap for SVG text: at most `maxLines` lines of ~`maxChars` characters, last line ellipsised. */
function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = next;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && (line || words.join(" ").length > lines.join(" ").length)) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

function doc(width: number, height: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}">${body}</svg>`;
}

// ---------------------------------------------------------------------------------------------------
// Builders (same geometry as images.ts)

/** compositePhoto: base photo at intrinsic size with each logo contain-fit into its normalised slot rect. */
export function compositePhotoSvg(opts: { base: Uint8Array; logos: { rect: SlotRect; logo: Uint8Array }[] }) {
  const { width: w, height: h } = layerSize(opts.base);
  let body = placeLayer(opts.base, { x: 0, y: 0, w, h }, "contain");
  for (const { rect, logo } of opts.logos) {
    if (!sniffRaster(logo)) continue; // undecodable logo: skipped, like asPng returning null
    const tw = Math.max(8, Math.round(rect.w * w));
    const th = Math.max(8, Math.round(rect.h * h));
    body += placeLayer(logo, { x: Math.round(rect.x * w), y: Math.round(rect.y * h), w: tw, h: th }, "contain");
  }
  return doc(w, h, body);
}

/** cropSlot: the slot's pixel rect of the base photo, via viewBox. */
export function slotCropSvg(base: Uint8Array, rect: SlotRect) {
  const { width: w, height: h } = layerSize(base);
  const left = Math.max(0, Math.round(rect.x * w));
  const top = Math.max(0, Math.round(rect.y * h));
  const cw = Math.max(8, Math.round(rect.w * w));
  const ch = Math.max(8, Math.round(rect.h * h));
  const mime = sniffRaster(base)?.mime ?? "image/png";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="${left} ${top} ${cw} ${ch}"><image x="0" y="0" width="${num(w)}" height="${num(h)}" href="${dataUri(base, mime)}"/></svg>`;
}

/** makeOg: 1200x630 card, copy on the left, composite cover-fit into the right 720px. */
export function ogSvg(opts: { title: string; raised: string; composite: Layer }) {
  // The text panel is 432px wide: wrap the title (36px ≈ 20 chars/line) instead of letting it run under the composite.
  const lines = wrapLines(opts.title, 20, 3);
  const title = lines.map((l, i) => `<tspan x="48" dy="${i === 0 ? 0 : 44}">${escapeXml(l)}</tspan>`).join("");
  const raisedY = 150 + (lines.length - 1) * 44 + 60;
  const body =
    `<rect width="1200" height="630" fill="${BG}"/>` +
    `<text x="48" y="72" font-family="${FONT}" font-size="22" fill="#d6ff3c">BODYTAG</text>` +
    `<text x="48" y="150" font-family="${FONT}" font-size="36" fill="#f4f0e7">${title}</text>` +
    `<text x="48" y="${raisedY}" font-family="${FONT}" font-size="28" fill="#f4f0e7">${escapeXml(opts.raised)} raised</text>` +
    `<text x="48" y="580" font-family="${FONT}" font-size="18" fill="#8a867c">Live auction · numbered ad slots · not a bet</text>` +
    placeLayer(opts.composite, { x: 480, y: 0, w: 720, h: 630 }, "cover", "start");
  return doc(1200, 630, body);
}

function letterboxSvg(composite: Layer, w: number, h: number) {
  return doc(w, h, `<rect width="${w}" height="${h}" fill="${BG}"/>` + placeLayer(composite, { x: 0, y: 0, w, h }, "contain"));
}

/** makeSquare: 1080x1080 letterbox on #070707. */
export function squareSvg(composite: Layer) {
  return letterboxSvg(composite, 1080, 1080);
}

/** makeStory: 1080x1920 letterbox on #070707. */
export function storySvg(composite: Layer) {
  return letterboxSvg(composite, 1080, 1920);
}

/** makePrint: scaled to fit inside 2400x3600 (or a smaller `maxW`x`maxH`), no padding (sharp `fit: "inside"`). */
export function printSvg(composite: Layer, maxW = 2400, maxH = 3600) {
  const size = layerSize(composite);
  const scale = Math.min(maxW / size.width, maxH / size.height);
  const w = Math.max(1, Math.round(size.width * scale));
  const h = Math.max(1, Math.round(size.height * scale));
  return doc(w, h, placeLayer(composite, { x: 0, y: 0, w, h }, "contain"));
}

/** makeArenaCard: 1200x900 snapshot with up to 8 logo tiles of 180px in a 4-column grid. */
export function arenaCardSvg(opts: { title: string; slots: { name: string; logo?: Uint8Array; price: string }[] }) {
  let body =
    `<rect width="1200" height="900" fill="#0b0a09"/>` +
    `<text x="60" y="80" font-family="${FONT}" font-size="20" fill="#d6ff3c">ARENA SNAPSHOT</text>` +
    `<text x="60" y="140" font-family="${FONT}" font-size="36" fill="#f4f0e7">${escapeXml(opts.title.slice(0, 48))}</text>`;
  let i = 0;
  for (const slot of opts.slots.slice(0, 8)) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 80 + col * 270;
    const y = 220 + row * 280;
    if (slot.logo && sniffRaster(slot.logo)) {
      body += placeLayer(slot.logo, { x, y, w: 180, h: 180 }, "contain");
    }
    i += 1;
  }
  return doc(1200, 900, body);
}
