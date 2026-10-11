"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { CampaignTheme, type Prisma } from "@bodytag/db";
import { DEFAULT_ARENA_SLOTS, defaultArenaConfig, isSafeHttpUrl, slugify, type ArenaConfig } from "@bodytag/shared";
import { prisma } from "@/lib/db";
import { clearSession, createSession, requireUser } from "@/lib/auth";
import { handleAllowed, assertCanPublish, submitKyc } from "@/lib/kyc";
import { MAX_STAKE_CENTS, canPublish, captureAndRefundStake, depositStake, enforceMargin } from "@/lib/stake";
import { BidError, createBidIntent } from "@/lib/bids";
import { PaymentUnavailableError } from "@/lib/circuit";
import { allowByIp, clientIp } from "@/lib/http";
import { enqueueImageJobs } from "@/lib/queue";
import { checkRateLimit } from "@/lib/redis";
import { publishCampaign } from "@/lib/redis";

export type AuthState = { error: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PRICE_CENTS = 100_000_000; // $1M per slot; takeovers double, so stay far below int32.

/** Statuses where a campaign can still be edited / published for the first time. */
const EDITABLE = ["draft"] as const;
const ACTIVE = ["live", "paused"] as const;
const isIn = (list: readonly string[], status: string) => list.includes(status);

export async function registerStateAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").toLowerCase().trim();
  if (!EMAIL_RE.test(email) || email.length > 254 || password.length < 8 || password.length > 128 || name.length > 80 || !name || !handleAllowed(handle)) {
    return { error: "Use a valid email, 8+ character password, and a free handle (letters/numbers)." };
  }
  if (!(await allowByIp(await headers(), "register", 10, 3600))) {
    return { error: "Too many sign-ups from this network. Try again later." };
  }
  const exists = await prisma.user.findFirst({ where: { OR: [{ email }, { handle }] } });
  if (exists) return { error: "Email or handle already taken." };
  let user;
  try {
    user = await prisma.user.create({
      data: { email, name, handle, passwordHash: await bcrypt.hash(password, 10) },
    });
  } catch {
    // Unique-constraint race: someone claimed the email/handle between the check above and the insert.
    return { error: "Email or handle already taken." };
  }
  await createSession({ userId: user.id, email: user.email, handle: user.handle });
  redirect("/dashboard");
}

export async function loginStateAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  if (
    !(await allowByIp(await headers(), "login", 30, 600)) ||
    !(await checkRateLimit(`ratelimit:login:email:${email}`, 10, 600))
  ) {
    return { error: "Too many sign-in attempts. Try again in a few minutes." };
  }
  const user = await prisma.user.findUnique({ where: { email } });
  // Always run a bcrypt compare so response time does not reveal whether the email exists.
  const hash = user?.passwordHash ?? "$2b$10$/8cB3SEhRSp5KMpAFz.32u8eWl/iRlbcNJm0tQjOrJhNtvGeJBbty";
  const passwordOk = await bcrypt.compare(password.slice(0, 128), hash);
  if (!user || !passwordOk) {
    return { error: "Unknown email or password." };
  }
  await createSession({ userId: user.id, email: user.email, handle: user.handle });
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}

export async function createCampaignFormAction(formData: FormData) {
  const result = await createCampaignAction(formData);
  if (result && "error" in result && result.error) {
    redirect(`/dashboard/campaigns/new?error=${encodeURIComponent(result.error)}`);
  }
}

export async function createCampaignAction(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const theme = String(formData.get("theme") ?? "photo") === "arena" ? CampaignTheme.arena : CampaignTheme.photo;
  const eventName = String(formData.get("eventName") ?? "").trim();
  const eventCity = String(formData.get("eventCity") ?? "").trim();
  const eventDate = new Date(String(formData.get("eventDate") ?? ""));
  const closeAt = new Date(String(formData.get("closeAt") ?? ""));
  const target = String(formData.get("targetTotal") ?? "");
  if (!title || !eventName || Number.isNaN(eventDate.getTime()) || Number.isNaN(closeAt.getTime())) {
    return { error: "Title, event, dates are required." };
  }
  if (title.length > 120 || eventName.length > 120) return { error: "Title and event name must be 120 characters or fewer." };
  if (closeAt.getTime() <= Date.now()) return { error: "Auction close must be in the future." };
  if (closeAt.getTime() > eventDate.getTime()) return { error: "Auction must close on or before the event date." };
  let targetTotalCents: number | null = null;
  if (target) {
    const dollars = Number(target);
    if (!Number.isFinite(dollars) || dollars < 0 || dollars * 100 > 2_000_000_000) {
      return { error: "Target total must be a positive dollar amount." };
    }
    targetTotalCents = dollars > 0 ? Math.round(dollars * 100) : null;
  }
  const slug = slugify(title);
  const campaign = await prisma.campaign.create({
    data: {
      creatorId: user.id,
      title,
      slug: `${slug}-${nanoid(4)}`,
      theme,
      eventName,
      eventCity,
      eventDate,
      closeAt,
      targetTotalCents,
      shortCode: nanoid(6),
      previewSecret: nanoid(12),
      arenaConfig: defaultArenaConfig as unknown as Prisma.InputJsonValue,
      affiliationNote:
        "Not an official event ticket or endorsement. You are buying advertising on this creator's BodyTag page.",
    },
  });
  if (theme === CampaignTheme.arena) {
    const surface = await prisma.surface.create({
      data: { campaignId: campaign.id, kind: "glb", objectKey: "procedural:mannequin", label: "body" },
    });
    await prisma.slot.createMany({
      data: DEFAULT_ARENA_SLOTS.map((s, i) => ({
        campaignId: campaign.id,
        surfaceId: surface.id,
        name: s.name,
        startPriceCents: s.startPriceCents,
        currentPriceCents: s.startPriceCents,
        marker: s.marker as Prisma.InputJsonValue,
        hyroxCm: s.hyroxCm,
        sortOrder: i,
      })),
    });
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard/campaigns/${campaign.id}`);
}

const ARENA_THEMES = ["grid", "ares", "studio", "neon", "none"] as const;
const START_CAMERAS = ["front", "back", "threeQuarter"] as const;

/** The editor posts a full config object; keep only known keys with valid values so a bad POST cannot break the arena. */
function sanitizeArenaConfig(raw: unknown): { config: ArenaConfig } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Invalid arena settings." };
  const r = raw as Record<string, unknown>;
  const bool = (k: keyof ArenaConfig) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (defaultArenaConfig[k] as boolean));
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T) => (allowed.includes(v as T) ? (v as T) : fallback);
  const video = typeof r.inSceneVideoUrl === "string" ? r.inSceneVideoUrl.trim() : "";
  if (video && !isSafeHttpUrl(video)) return { error: "In-scene video URL must start with http:// or https://" };
  const decal = Number(r.maxDecalCm);
  return {
    config: {
      theme: pick(r.theme, ARENA_THEMES, defaultArenaConfig.theme),
      soundtrack: bool("soundtrack"),
      soundtrackMutedMobile: bool("soundtrackMutedMobile"),
      reducedMotion: bool("reducedMotion"),
      showGrid: bool("showGrid"),
      showHdri: bool("showHdri"),
      showTicker: bool("showTicker"),
      markerStyle: pick(r.markerStyle, ["outline", "filled"] as const, defaultArenaConfig.markerStyle),
      maxDecalCm: Number.isFinite(decal) && decal > 0 && decal <= 100 ? decal : defaultArenaConfig.maxDecalCm,
      startCamera: pick(r.startCamera, START_CAMERAS, defaultArenaConfig.startCamera),
      rewindEnabled: bool("rewindEnabled"),
      ...(video ? { inSceneVideoUrl: video } : {}),
    },
  };
}

export async function saveArenaConfigAction(campaignId: string, json: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: "Invalid arena settings." };
  }
  const cleaned = sanitizeArenaConfig(raw);
  if ("error" in cleaned) return { error: cleaned.error };
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { arenaConfig: cleaned.config as unknown as Prisma.InputJsonValue },
  });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true };
}

export async function saveSoundtrackAction(campaignId: string, key: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  if (key && !/^audio\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(mp3|wav|ogg)$/.test(key)) return { error: "Invalid soundtrack" };
  await prisma.campaign.update({ where: { id: campaignId }, data: { soundtrackKey: key || null } });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true };
}

export async function saveSlotsAction(campaignId: string, json: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  let slots: {
    id?: string;
    surfaceId: string;
    name: string;
    startPriceCents: number;
    rect?: unknown;
    marker?: unknown;
    hyroxCm?: number;
    sizeNote?: string;
  }[];
  try {
    slots = JSON.parse(json);
  } catch {
    return { error: "Invalid slot data." };
  }
  if (!Array.isArray(slots) || slots.length > 100) return { error: "Invalid slot data." };
  for (const slot of slots) {
    slot.name = String(slot.name ?? "").trim();
    if (!slot.name) return { error: "Every slot needs a name." };
    if (slot.name.length > 80) return { error: "Slot names must be 80 characters or fewer." };
    if (!Number.isInteger(slot.startPriceCents) || slot.startPriceCents < 100 || slot.startPriceCents > MAX_PRICE_CENTS) {
      return { error: `Price for "${slot.name}" must be between $1 and $${MAX_PRICE_CENTS / 100}.` };
    }
  }

  // Verify all updated slot IDs and surface IDs strictly belong to this campaign
  for (const slot of slots) {
    if (slot.surfaceId) {
      const surface = await prisma.surface.findUnique({
        where: { id: slot.surfaceId },
        select: { campaignId: true },
      });
      if (!surface || surface.campaignId !== campaignId) {
        return { error: "Surface does not belong to this campaign" };
      }
    }
    if (slot.id) {
      const existing = await prisma.slot.findUnique({
        where: { id: slot.id },
        select: { campaignId: true },
      });
      if (!existing || existing.campaignId !== campaignId) {
        return { error: "Slot does not belong to this campaign" };
      }
    }
  }

  const incomingIds = slots.map((s) => s.id).filter(Boolean) as string[];
  await prisma.slot.deleteMany({
    where: {
      campaignId,
      id: { notIn: incomingIds },
      bids: { none: {} },
    },
  });

  const savedSlots: Array<{
    id: string;
    surfaceId: string;
    name: string;
    startPriceCents: number;
    rect?: unknown;
    marker?: unknown;
    hyroxCm?: number;
    sizeNote?: string;
  }> = [];

  for (const [i, slot] of slots.entries()) {
    if (slot.id) {
      const updated = await prisma.slot.update({
        where: { id: slot.id },
        data: {
          name: slot.name,
          startPriceCents: slot.startPriceCents,
          currentPriceCents: campaign.status === "draft" ? slot.startPriceCents : undefined,
          rect: slot.rect as Prisma.InputJsonValue,
          marker: slot.marker as Prisma.InputJsonValue,
          hyroxCm: slot.hyroxCm,
          sizeNote: slot.sizeNote,
          sortOrder: i,
        },
      });
      savedSlots.push({
        id: updated.id,
        surfaceId: updated.surfaceId,
        name: updated.name,
        startPriceCents: updated.startPriceCents,
        rect: updated.rect,
        marker: updated.marker,
        hyroxCm: updated.hyroxCm ?? undefined,
        sizeNote: updated.sizeNote ?? undefined,
      });
    } else {
      const created = await prisma.slot.create({
        data: {
          campaignId,
          surfaceId: slot.surfaceId,
          name: slot.name,
          startPriceCents: slot.startPriceCents,
          currentPriceCents: slot.startPriceCents,
          rect: slot.rect as Prisma.InputJsonValue,
          marker: slot.marker as Prisma.InputJsonValue,
          hyroxCm: slot.hyroxCm,
          sizeNote: slot.sizeNote,
          sortOrder: i,
        },
      });
      savedSlots.push({
        id: created.id,
        surfaceId: created.surfaceId,
        name: created.name,
        startPriceCents: created.startPriceCents,
        rect: created.rect,
        marker: created.marker,
        hyroxCm: created.hyroxCm ?? undefined,
        sizeNote: created.sizeNote ?? undefined,
      });
    }
  }
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true, slots: savedSlots };
}

export async function saveVetoAction(campaignId: string, veto: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  const list = veto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await prisma.campaign.update({ where: { id: campaignId }, data: { vetoList: list } });
  return { ok: true };
}

export async function publishCampaignAction(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  // Only a draft can be published. Paused campaigns must go through Resume (which re-checks the Stake margin);
  // closed/fulfilled campaigns have already settled money and must never go live again.
  if (!isIn(EDITABLE, campaign.status)) {
    return { error: campaign.status === "paused" ? "This campaign is paused. Use Resume instead." : "This campaign is already published or finished." };
  }
  if (campaign.closeAt.getTime() <= Date.now()) return { error: "Auction close date has passed. Create a new campaign." };
  const slotCount = await prisma.slot.count({ where: { campaignId } });
  if (slotCount === 0) return { error: "Add at least one sellable slot before publishing." };
  if (campaign.theme === "photo" && (await prisma.surface.count({ where: { campaignId } })) === 0) {
    return { error: "Upload at least one photo to place your slots on before publishing." };
  }
  const kyc = await assertCanPublish(user.id, campaign.eventDate);
  if (!kyc.ok) return { error: kyc.reason };
  const stake = await canPublish(campaignId, user.kycTier);
  if (!stake.ok) {
    return { error: `Deposit at least ${stake.min / 100} USD Stake (prepaid hosted-service margin) before going live.` };
  }
  const published = await prisma.campaign.updateMany({
    where: { id: campaignId, status: "draft" },
    data: { status: "live", pausedReason: null },
  });
  if (published.count !== 1) return { error: "This campaign is already published or finished." };
  await enqueueImageJobs(campaignId);
  revalidatePath(`/c/${user.handle}/${campaign.slug}`);
  redirect(`/@${user.handle}/${campaign.slug}`);
}

export async function pauseCampaignAction(campaignId: string, reason: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  if (campaign.status !== "live") return { error: "Only a live campaign can be paused." };
  const paused = await prisma.campaign.updateMany({
    where: { id: campaignId, status: "live" },
    data: { status: "paused", pausedReason: (reason || "Paused by creator").slice(0, 300) },
  });
  if (paused.count !== 1) return { error: "Only a live campaign can be paused." };
  await publishCampaign(campaignId, { type: "paused", reason: "creator" });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true };
}

export async function resumeCampaignAction(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  if (campaign.status !== "paused") return { error: "Only a paused campaign can be resumed." };
  if (campaign.closeAt.getTime() <= Date.now()) return { error: "Auction close date has passed." };
  const marginCheck = await enforceMargin(campaignId);
  if (!marginCheck.ok) {
    return {
      error:
        "Stake does not cover 1% of current GMV plus the next takeover. Top up the prepaid hosted-service margin to resume.",
    };
  }
  await prisma.campaign.updateMany({ where: { id: campaignId, status: "paused" }, data: { status: "live", pausedReason: null } });
  await publishCampaign(campaignId, { type: "live" });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true };
}

export async function depositStakeAction(formData: FormData) {
  const user = await requireUser();
  const campaignId = String(formData.get("campaignId") ?? "");
  const dollars = Number(formData.get("amount") ?? "0");
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  if (!Number.isFinite(dollars) || dollars <= 0) return { error: "Enter a Stake amount." };
  if (dollars > 100_000 || Math.round(dollars * 100) > MAX_STAKE_CENTS || Math.round(dollars * 100) < 1) {
    return { error: "Stake top-ups are limited to $100,000 at a time." };
  }
  if (!isIn(["draft", "live", "paused"], campaign.status)) return { error: "This campaign is finished; Stake can no longer be topped up." };
  await depositStake({
    campaignId,
    creatorId: user.id,
    creatorEmail: user.email,
    amountCents: Math.round(dollars * 100),
  });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true };
}

export async function submitProofAction(campaignId: string, proofKey: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  // Capturing the fee twice would wipe the accrued fee/GMV snapshot, and a draft has nothing to prove.
  if (!isIn(ACTIVE, campaign.status)) return { error: "Event proof can only be submitted for a live or paused campaign." };
  if (!/^proof\/[A-Za-z0-9_./-]{1,200}$/.test(proofKey) || proofKey.includes("..")) {
    return { error: "Upload the event proof first." };
  }
  // captureAndRefundStake closes the campaign atomically with the Stake settlement, so do not pre-close it here.
  let result;
  try {
    result = await captureAndRefundStake(campaignId, "fulfilled");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not settle the campaign." };
  }
  await prisma.campaign.update({ where: { id: campaignId }, data: { eventProofKey: proofKey } });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true, result };
}

export async function cancelCampaignAction(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  // After fulfilment/cancellation the money has already moved; cancelling again would refund brands a second time.
  if (!isIn(["draft", "live", "paused"], campaign.status)) return { error: "This campaign is already finished." };
  let result;
  try {
    result = await captureAndRefundStake(campaignId, "cancelled");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not cancel the campaign." };
  }
  await publishCampaign(campaignId, { type: "cancelled" });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true, result };
}

export async function kycAction(formData: FormData): Promise<KycState> {
  const user = await requireUser();
  const result = await submitKyc(user.id, {
    phone: String(formData.get("phone") ?? "") || undefined,
    socialX: String(formData.get("socialX") ?? "") || undefined,
    socialInstagram: String(formData.get("socialInstagram") ?? "") || undefined,
    idSelfie: formData.get("idSelfie") === "on",
  });
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath("/dashboard/kyc");
  return { ok: true, tier: result.tier };
}

export async function bidAction(input: {
  campaignId: string;
  slotId: string;
  brandEmail: string;
  brandName: string;
  logoKey: string;
  tagline?: string;
  url?: string;
  expectedPriceCents: number;
  xHandle?: string;
}) {
  try {
    if (!(await allowByIp(await headers(), "bid", 20, 60))) {
      return { ok: false as const, error: "Too many attempts. Try again in a minute." };
    }
    const result = await createBidIntent(input);
    return {
      ok: true as const,
      settled: result.settled,
      checkoutUrl: result.checkoutUrl,
      bidId: result.bid.id,
      magicToken: result.bid.magicToken,
    };
  } catch (e) {
    if (e instanceof BidError || e instanceof PaymentUnavailableError) {
      return { ok: false as const, error: e.message };
    }
    console.error("bidAction failed:", e);
    return { ok: false as const, error: "Bid failed. Nothing was charged; try again." };
  }
}

export async function reportCampaignAction(campaignId: string, reason: string, email?: string) {
  const cleanReason = (reason ?? "").trim();
  if (!cleanReason || cleanReason.length < 5 || cleanReason.length > 1000) {
    return { ok: false, error: "Reason must be between 5 and 1000 characters." };
  }

  const cleanEmail = email ? email.trim().toLowerCase() : null;
  if (cleanEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return { ok: false, error: "Invalid email address." };
    }
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return { ok: false, error: "Campaign not found." };
  }

  let ip = "unknown";
  try {
    ip = clientIp(await headers());
  } catch {
    // Ignore header error if invoked outside request context
  }

  const ipAllowed = await checkRateLimit(`ratelimit:report:ip:${ip}`, 5, 600);
  if (!ipAllowed) {
    return { ok: false, error: "Too many reports submitted. Please try again later." };
  }

  const campIpAllowed = await checkRateLimit(`ratelimit:report:camp:${campaignId}:${ip}`, 2, 86400);
  if (!campIpAllowed) {
    return { ok: false, error: "You have already reported this campaign recently." };
  }

  if (cleanEmail) {
    const existing = await prisma.report.findFirst({
      where: {
        campaignId,
        email: cleanEmail,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) {
      return { ok: false, error: "A report from this email has already been submitted for this campaign." };
    }
  }

  await prisma.report.create({ data: { campaignId, reason: cleanReason, email: cleanEmail } });
  const count = await prisma.report.count({ where: { campaignId } });

  // Rather than immediately auto-pausing without human verification (which enables DoS attacks),
  // open a priority moderation ticket for admin review once reports accumulate.
  if (count >= 3) {
    const existingTicket = await prisma.supportTicket.findFirst({
      where: { campaignId, kind: "moderation_report", status: "open" },
    });
    if (!existingTicket) {
      await prisma.supportTicket.create({
        data: {
          kind: "moderation_report",
          campaignId,
          email: cleanEmail ?? "moderation@bodytag.app",
          body: `Campaign ${campaignId} ("${campaign.title}") has received ${count} abuse reports. Latest report: "${cleanReason}". Please investigate and verify before taking moderation action.`,
          status: "open",
        },
      });
    }
  }

  return { ok: true };
}

export type TicketState = { ok: boolean; error?: string };
export async function createTicketFormAction(_prev: TicketState, formData: FormData): Promise<TicketState> {
  return createTicketAction(formData);
}

export async function depositStakeFormAction(_prev: { ok?: boolean; error?: string }, formData: FormData) {
  const res = await depositStakeAction(formData);
  return res ?? {};
}

export type KycState = { ok: boolean; error?: string; tier?: number };
export async function kycFormAction(_prev: KycState, formData: FormData): Promise<KycState> {
  return kycAction(formData);
}

export async function createTicketAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const body = String(formData.get("body") ?? "").trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email so we can reply." };
  if (body.length < 5 || body.length > 4000) return { ok: false, error: "Describe the problem in 5–4000 characters." };
  let allowed = true;
  try {
    allowed = await allowByIp(await headers(), "ticket", 5, 600);
  } catch {
    /* outside a request context */
  }
  if (!allowed) {
    return { ok: false, error: "Too many tickets from this connection. Try again in a few minutes." };
  }
  // An unknown campaign id would violate the foreign key and 500 the form.
  const rawCampaignId = String(formData.get("campaignId") ?? "").slice(0, 64);
  const knownCampaign = rawCampaignId
    ? await prisma.campaign.findUnique({ where: { id: rawCampaignId }, select: { id: true } })
    : null;
  await prisma.supportTicket.create({
    data: {
      kind: String(formData.get("kind") ?? "general").slice(0, 40),
      email,
      body,
      campaignId: knownCampaign?.id ?? null,
      slotId: String(formData.get("slotId") ?? "") || null,
      paymentId: String(formData.get("paymentId") ?? "") || null,
    },
  });
  return { ok: true };
}
