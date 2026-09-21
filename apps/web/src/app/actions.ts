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
import { canPublish, captureAndRefundStake, depositStake, enforceMargin } from "@/lib/stake";
import { createBidIntent } from "@/lib/bids";
import { enqueueImageJobs } from "@/lib/queue";
import { checkRateLimit } from "@/lib/redis";
import { publishCampaign } from "@/lib/redis";

export type AuthState = { error: string | null };

export async function registerStateAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").toLowerCase().trim();
  if (!email || password.length < 8 || !name || !handleAllowed(handle)) {
    return { error: "Use a valid email, 8+ character password, and a free handle (letters/numbers)." };
  }
  const exists = await prisma.user.findFirst({ where: { OR: [{ email }, { handle }] } });
  if (exists) return { error: "Email or handle already taken." };
  const user = await prisma.user.create({
    data: { email, name, handle, passwordHash: await bcrypt.hash(password, 10) },
  });
  await createSession({ userId: user.id, email: user.email, handle: user.handle });
  redirect("/dashboard");
}

export async function loginStateAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
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
      targetTotalCents: target ? Math.round(Number(target) * 100) : null,
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
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { arenaConfig: JSON.parse(json) },
  });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true };
}

export async function saveSoundtrackAction(campaignId: string, key: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  await prisma.campaign.update({ where: { id: campaignId }, data: { soundtrackKey: key } });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true };
}

export async function saveSlotsAction(campaignId: string, json: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  const slots = JSON.parse(json) as {
    id?: string;
    surfaceId: string;
    name: string;
    startPriceCents: number;
    rect?: unknown;
    marker?: unknown;
    hyroxCm?: number;
    sizeNote?: string;
  }[];

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
  const kyc = await assertCanPublish(user.id, campaign.eventDate);
  if (!kyc.ok) return { error: kyc.reason };
  const stake = await canPublish(campaignId, user.kycTier);
  if (!stake.ok) {
    return { error: `Deposit at least ${stake.min / 100} USD Stake (prepaid hosted-service margin) before going live.` };
  }
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "live", pausedReason: null } });
  await enqueueImageJobs(campaignId);
  revalidatePath(`/c/${user.handle}/${campaign.slug}`);
  redirect(`/@${user.handle}/${campaign.slug}`);
}

export async function pauseCampaignAction(campaignId: string, reason: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "paused", pausedReason: reason || "Paused by creator" },
  });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true };
}

export async function resumeCampaignAction(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  const marginCheck = await enforceMargin(campaignId);
  if (!marginCheck.ok) {
    return {
      error:
        "Stake does not cover 1% of current GMV plus the next takeover. Top up the prepaid hosted-service margin to resume.",
    };
  }
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "live", pausedReason: null } });
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
  if (dollars <= 0) return { error: "Enter a Stake amount." };
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
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { eventProofKey: proofKey, status: "closed" },
  });
  const result = await captureAndRefundStake(campaignId, "fulfilled");
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true, result };
}

export async function cancelCampaignAction(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== user.id) return { error: "Forbidden" };
  const result = await captureAndRefundStake(campaignId, "cancelled");
  await publishCampaign(campaignId, { type: "cancelled" });
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  return { ok: true, result };
}

export async function kycAction(formData: FormData) {
  const user = await requireUser();
  const tier = await submitKyc(user.id, {
    phone: String(formData.get("phone") ?? "") || undefined,
    socialX: String(formData.get("socialX") ?? "") || undefined,
    socialInstagram: String(formData.get("socialInstagram") ?? "") || undefined,
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
    const result = await createBidIntent(input);
    return {
      ok: true as const,
      settled: result.settled,
      checkoutUrl: result.checkoutUrl,
      bidId: result.bid.id,
      magicToken: result.bid.magicToken,
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Bid failed" };
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
    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for");
    ip = forwarded ? forwarded.split(",")[0].trim() : (headerStore.get("x-real-ip") ?? "unknown");
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
  await prisma.supportTicket.create({
    data: {
      kind: String(formData.get("kind") ?? "general"),
      email: String(formData.get("email") ?? ""),
      body: String(formData.get("body") ?? ""),
      campaignId: String(formData.get("campaignId") ?? "") || null,
      slotId: String(formData.get("slotId") ?? "") || null,
      paymentId: String(formData.get("paymentId") ?? "") || null,
    },
  });
  return { ok: true };
}
