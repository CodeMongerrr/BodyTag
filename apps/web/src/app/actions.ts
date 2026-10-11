"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { CampaignTheme, type Prisma } from "@bodytag/db";
import { DEFAULT_ARENA_SLOTS, defaultArenaConfig, slugify } from "@bodytag/shared";
import { prisma } from "@/lib/db";
import { clearSession, createSession, requireUser } from "@/lib/auth";
import { handleAllowed, assertCanPublish, submitKyc } from "@/lib/kyc";
import { MAX_STAKE_CENTS, canPublish, captureAndRefundStake, depositStake, enforceMargin } from "@/lib/stake";
import { BidError, createBidIntent } from "@/lib/bids";
import { PaymentUnavailableError } from "@/lib/circuit";
import { allowByIp, clientIp } from "@/lib/http";
import { isEmail, isPositiveInt32 } from "@/lib/validation";
import { enqueueImageJobs } from "@/lib/queue";
import { checkRateLimit } from "@/lib/redis";
import { publishCampaign } from "@/lib/redis";

export type AuthState = { error: string | null };

export async function registerStateAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").toLowerCase().trim();
  if (!isEmail(email) || password.length < 8 || password.length > 128 || !name || name.length > 80 || !handleAllowed(handle)) {
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
  } catch (e) {
    // Lost a race on the unique email/handle index.
    if ((e as { code?: string }).code === "P2002") return { error: "Email or handle already taken." };
    throw e;
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
  const target = String(formData.get("targetTotal") ?? "").trim();
  if (!title || !eventName || Number.isNaN(eventDate.getTime()) || Number.isNaN(closeAt.getTime())) {
    return { error: "Title, event, dates are required." };
  }
  if (title.length > 120 || eventName.length > 120 || eventCity.length > 80) {
    return { error: "Title, event or city is too long." };
  }
  const targetCents = target ? Math.round(Number(target) * 100) : null;
  if (targetCents !== null && !isPositiveInt32(targetCents)) {
    return { error: "Target total must be a positive amount." };
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
      targetTotalCents: targetCents,
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

export async function saveArenaConfigAction(campaignId: string, json: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  let config: unknown;
  try {
    config = JSON.parse(json);
  } catch {
    return { error: "Invalid arena config" };
  }
  if (!config || typeof config !== "object" || Array.isArray(config) || json.length > 20_000) {
    return { error: "Invalid arena config" };
  }
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { arenaConfig: config as Prisma.InputJsonValue },
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
    return { error: "Invalid slot data" };
  }
  if (!Array.isArray(slots) || slots.length > 64) return { error: "Invalid slot data" };
  for (const slot of slots) {
    if (!slot || typeof slot !== "object" || typeof slot.name !== "string" || !slot.name.trim() || slot.name.length > 80) {
      return { error: "Every slot needs a name (80 characters max)" };
    }
    if (!isPositiveInt32(slot.startPriceCents) || slot.startPriceCents > 1_000_000_000) {
      return { error: `Slot "${slot.name}" needs a positive whole-cent price` };
    }
    if (typeof slot.surfaceId !== "string" || !slot.surfaceId) return { error: "Every slot needs a surface" };
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
  if (campaign.status !== "draft") return { error: "Only a draft campaign can be published." };
  if ((await prisma.slot.count({ where: { campaignId } })) === 0) return { error: "Add at least one slot before going live." };
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
  if (published.count !== 1) return { error: "Only a draft campaign can be published." };
  await enqueueImageJobs(campaignId);
  revalidatePath(`/c/${user.handle}/${campaign.slug}`);
  redirect(`/@${user.handle}/${campaign.slug}`);
}

export async function pauseCampaignAction(campaignId: string, reason: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
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
  const amountCents = Math.round(dollars * 100);
  if (amountCents < 1 || amountCents > MAX_STAKE_CENTS) return { error: "Stake amount is out of range." };
  if (campaign.status === "closed" || campaign.status === "fulfilled") {
    return { error: "This campaign is already settled." };
  }
  await depositStake({
    campaignId,
    creatorId: user.id,
    creatorEmail: user.email,
    amountCents,
  });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true };
}

export async function submitProofAction(campaignId: string, proofKey: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  if (!/^proof\/[A-Za-z0-9_./-]{1,200}$/.test(proofKey) || proofKey.includes("..")) {
    return { error: "Upload the event proof first." };
  }
  if (campaign.status !== "live" && campaign.status !== "paused") {
    return { error: "Only a running campaign can be marked fulfilled." };
  }
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

export async function kycAction(formData: FormData) {
  const user = await requireUser();
  const field = (name: string) => String(formData.get(name) ?? "").trim().slice(0, 64) || undefined;
  const tier = await submitKyc(user.id, {
    phone: field("phone"),
    socialX: field("socialX"),
    socialInstagram: field("socialInstagram"),
    idSelfie: formData.get("idSelfie") === "on",
  });
  revalidatePath("/dashboard/kyc");
  return { ok: true, tier };
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

export async function createTicketFormAction(formData: FormData) {
  await createTicketAction(formData);
}

export async function depositStakeFormAction(formData: FormData) {
  await depositStakeAction(formData);
}

export async function kycFormAction(formData: FormData) {
  await kycAction(formData);
}

export async function createTicketAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const body = String(formData.get("body") ?? "").trim();
  if (!isEmail(email) || !body || body.length > 4000) {
    return { ok: false as const, error: "Enter a valid email and a message under 4000 characters." };
  }
  let allowed = true;
  try {
    allowed = await allowByIp(await headers(), "ticket", 5, 600);
  } catch {
    // outside a request context
  }
  if (!allowed) {
    return { ok: false as const, error: "Too many tickets. Try again later." };
  }
  const optional = (name: string) => String(formData.get(name) ?? "").trim().slice(0, 128) || null;
  const campaignId = optional("campaignId");
  const knownCampaign = campaignId
    ? await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } })
    : null;
  await prisma.supportTicket.create({
    data: {
      kind: String(formData.get("kind") ?? "general").trim().slice(0, 40) || "general",
      email,
      body,
      campaignId: knownCampaign?.id ?? null,
      slotId: optional("slotId"),
      paymentId: optional("paymentId"),
    },
  });
  return { ok: true as const };
}
