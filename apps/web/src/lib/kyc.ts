import { BLOCKED_HANDLES } from "@bodytag/shared";
import { prisma } from "./db";

const CELEBRITY = ["elonmusk", "taylorswift", "cristiano", "viratkohli", "mrbeast"];

export function handleAllowed(handle: string) {
  const h = handle.toLowerCase();
  if (BLOCKED_HANDLES.includes(h)) return false;
  if (CELEBRITY.includes(h)) return false;
  return /^[a-z0-9_]{3,24}$/.test(h);
}

export async function assertCanPublish(userId: string, eventDate: Date) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.kycTier < 1) {
    return { ok: false as const, reason: "Add a phone number and a public X or Instagram handle (Creator L1) before publishing a live URL." };
  }
  const in90 = Date.now() + 1000 * 60 * 60 * 24 * 90;
  if (eventDate.getTime() > in90 || eventDate.getTime() < Date.now() - 1000 * 60 * 60 * 24) {
    return { ok: false as const, reason: "Event date must be in the next 90 days so we can check it is not a ghost event." };
  }
  const disputed = await prisma.campaign.findFirst({
    where: { creatorId: userId, reports: { some: {} }, status: { in: ["live", "paused"] } },
  });
  if (disputed && user.kycTier < 3) {
    return { ok: false as const, reason: "Another campaign is in review. High-volume (L3) is required to run two at once." };
  }
  return { ok: true as const };
}

export async function submitKyc(userId: string, input: { phone?: string; socialX?: string; socialInstagram?: string; idSelfie?: boolean }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  let tier = user.kycTier;
  if (input.phone && (input.socialX || input.socialInstagram)) tier = Math.max(tier, 1);
  if (input.idSelfie && tier >= 1) tier = Math.max(tier, 2);
  await prisma.kycCheck.create({
    data: {
      userId,
      tier,
      status: "approved",
      provider: "mock-persona",
      payload: input,
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      phone: input.phone ?? user.phone,
      socialX: input.socialX ?? user.socialX,
      socialInstagram: input.socialInstagram ?? user.socialInstagram,
      kycTier: tier,
      verified: tier >= 2,
    },
  });
  return tier;
}
