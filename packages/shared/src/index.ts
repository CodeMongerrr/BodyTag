export const HOSTED_FEE_BPS_DEFAULT = 0;

export type Money = { cents: number; currency: string };

export type ArenaConfig = {
  theme: "grid" | "ares" | "studio" | "neon" | "none";
  soundtrack: boolean;
  soundtrackMutedMobile: boolean;
  reducedMotion: boolean;
  showGrid: boolean;
  showHdri: boolean;
  showTicker: boolean;
  markerStyle: "outline" | "filled";
  maxDecalCm: 20 | 32 | number;
  startCamera: "front" | "back" | "threeQuarter";
  rewindEnabled: boolean;
  inSceneVideoUrl?: string;
};

export const defaultArenaConfig: ArenaConfig = {
  theme: "grid",
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
};

/** Provenance of a `Surface.kind === "glb"` body. Stored in `Surface.meta`. */
export type AvatarMeta = {
  source: "avaturn" | "upload";
  /** Avaturn export payload fields we keep. `avatarId` lets a paid-tier session reopen the avatar later. */
  avatarId?: string;
  sessionId?: string;
  gender?: "male" | "female";
  bodyId?: string;
  supportsFaceAnimations?: boolean;
  /** Skeleton naming convention. Avaturn exports Mixamo bone names without the `mixamorig:` prefix. */
  rig?: "mixamo_T";
  createdAt?: string;
};

export function isAvatarMeta(v: unknown): v is AvatarMeta {
  return !!v && typeof v === "object" && ((v as AvatarMeta).source === "avaturn" || (v as AvatarMeta).source === "upload");
}

/** Whitelist the fields we store from a client-supplied avatar meta; anything else is dropped. */
export function sanitizeAvatarMeta(v: unknown): AvatarMeta | null {
  if (!isAvatarMeta(v)) return null;
  const str = (x: unknown, max = 128) => (typeof x === "string" && x.length > 0 && x.length <= max ? x : undefined);
  const out: AvatarMeta = { source: v.source };
  const avatarId = str(v.avatarId);
  const sessionId = str(v.sessionId);
  const bodyId = str(v.bodyId, 32);
  const createdAt = str(v.createdAt, 40);
  if (avatarId) out.avatarId = avatarId;
  if (sessionId) out.sessionId = sessionId;
  if (v.gender === "male" || v.gender === "female") out.gender = v.gender;
  if (bodyId) out.bodyId = bodyId;
  if (typeof v.supportsFaceAnimations === "boolean") out.supportsFaceAnimations = v.supportsFaceAnimations;
  if (v.rig === "mixamo_T") out.rig = v.rig;
  if (createdAt && !Number.isNaN(Date.parse(createdAt))) out.createdAt = createdAt;
  return out;
}

export type SlotRect = { x: number; y: number; w: number; h: number };

/** Which side of the body a decal is projected onto (the direction its surface normal faces). */
export type SlotFace = "front" | "back" | "left" | "right";

/**
 * 3D slot placement. `x/y/z` is the legacy world-space position used by the procedural mannequin.
 * On a rigged avatar, `bone` (+ `dx/dy/dz` offset in metres) anchors the slot to the skeleton so it lands on the
 * body regardless of the person's proportions; the canvas then ray-casts along `face` onto the skin and projects a decal.
 */
export type SlotMarker = {
  x: number;
  y: number;
  z: number;
  nx?: number;
  ny?: number;
  nz?: number;
  /** Decal width in metres. */
  scale?: number;
  /** Height / width. Default 1 (square). Arm strips use ~1.6. */
  aspect?: number;
  /** Mixamo bone name without the `mixamorig:` prefix, e.g. Spine2, LeftArm, RightUpLeg. */
  bone?: string;
  dx?: number;
  dy?: number;
  dz?: number;
  face?: SlotFace;
};

/**
 * Default bone anchors for a fresh arena campaign, tuned on Avaturn's male T1 export (1.87 m).
 * Offsets are in metres from the bone origin; bones sit at the joint (shoulder, hip), so arm/leg slots offset downward.
 */
export const DEFAULT_ARENA_SLOTS: Array<{ name: string; startPriceCents: number; hyroxCm: number; marker: SlotMarker }> = [
  { name: "Left chest", startPriceCents: 100_000, hyroxCm: 32, marker: { x: 0.18, y: 1.15, z: 0.22, scale: 0.13, bone: "Spine2", dx: 0.09, dy: 0.04, face: "front" } },
  { name: "Right chest", startPriceCents: 100_000, hyroxCm: 32, marker: { x: -0.18, y: 1.15, z: 0.22, scale: 0.13, bone: "Spine2", dx: -0.09, dy: 0.04, face: "front" } },
  { name: "Abs", startPriceCents: 60_000, hyroxCm: 20, marker: { x: 0, y: 0.85, z: 0.24, scale: 0.15, bone: "Spine", dy: 0.02, face: "front" } },
  { name: "Left arm", startPriceCents: 45_000, hyroxCm: 20, marker: { x: 0.48, y: 1.05, z: 0.05, scale: 0.075, aspect: 1.6, bone: "LeftArm", dy: -0.13, face: "left" } },
  { name: "Right arm", startPriceCents: 45_000, hyroxCm: 20, marker: { x: -0.48, y: 1.05, z: 0.05, scale: 0.075, aspect: 1.6, bone: "RightArm", dy: -0.13, face: "right" } },
  { name: "Left quad", startPriceCents: 55_000, hyroxCm: 32, marker: { x: 0.14, y: 0.35, z: 0.16, scale: 0.12, bone: "LeftUpLeg", dy: -0.2, dx: 0.01, face: "front" } },
  { name: "Right quad", startPriceCents: 55_000, hyroxCm: 32, marker: { x: -0.14, y: 0.35, z: 0.16, scale: 0.12, bone: "RightUpLeg", dy: -0.2, dx: -0.01, face: "front" } },
  { name: "Back banner", startPriceCents: 90_000, hyroxCm: 32, marker: { x: 0, y: 1.2, z: -0.22, scale: 0.24, aspect: 0.7, bone: "Spine2", dy: 0.02, face: "back" } },
];

export const IMAGE_VARIANTS = ["og", "square", "story", "print", "slot_crop"] as const;
export type ImageVariant = (typeof IMAGE_VARIANTS)[number];

export const VARIANT_SIZE: Record<Exclude<ImageVariant, "slot_crop">, { w: number; h: number }> = {
  og: { w: 1200, h: 630 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
  print: { w: 2400, h: 3600 },
};

export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function minStakeCents(openingInventoryCents: number, kycTier: number) {
  const floor = kycTier >= 2 ? 2_500 : 5_000;
  return Math.max(floor, Math.ceil(openingInventoryCents * 0.01));
}

export function feeFromGmv(gmvCents: number, bps: number) {
  return Math.ceil((gmvCents * bps) / 10_000);
}

export function requiredMarginCents(gmvCents: number, nextTakeoverCents: number, bps: number) {
  if (bps <= 0) return 0;
  return feeFromGmv(gmvCents + nextTakeoverCents, bps);
}

export function nextPossibleTakeoverCents(slotPrices: number[]) {
  if (!slotPrices.length) return 0;
  return Math.max(...slotPrices);
}

export function stakeCoversNext(remainingStakeCents: number, gmvCents: number, nextTakeoverCents: number, bps: number) {
  return remainingStakeCents >= requiredMarginCents(gmvCents, nextTakeoverCents, bps);
}

export function livePath(handle: string, slug: string) {
  return `/@${handle}/${slug}`;
}

export function imageCacheKey(campaignId: string, variant: string, version: string) {
  return `images/${campaignId}/${variant}.png?v=${version}`;
}

export const BLOCKED_HANDLES = [
  "hyrox",
  "token2049",
  "marclou",
  "vanshika",
  "nike",
  "adidas",
  "google",
  "apple",
  "tesla",
  "admin",
  "bodytag",
  "support",
];

export const NSFW_TERMS = [
  "porn",
  "xxx",
  "nsfw",
  "onlyfans",
  "hate",
  "nazi",
  "terror",
];

export function moderateText(input: string) {
  const lower = input.toLowerCase();
  return NSFW_TERMS.find((t) => lower.includes(t)) ?? null;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "campaign";
}

export function isSafeHttpUrl(urlString: string | null | undefined): boolean {
  if (!urlString || typeof urlString !== "string") return false;
  const trimmed = urlString.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

