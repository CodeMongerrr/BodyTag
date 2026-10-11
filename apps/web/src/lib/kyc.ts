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
  // "In review" means moderators opened a ticket (3+ reports), not that a single anonymous report exists;
  // otherwise anyone could lock a creator out of publishing with one click.
  const disputed = await prisma.campaign.findFirst({
    where: {
      creatorId: userId,
      status: { in: ["live", "paused"] },
      tickets: { some: { kind: "moderation_report", status: "open" } },
    },
  });
  if (disputed && user.kycTier < 3) {
    return { ok: false as const, reason: "Another campaign is in review. High-volume (L3) is required to run two at once." };
  }
  return { ok: true as const };
}

export async function submitKyc(userId: string, input: { phone?: string; socialX?: string; socialInstagram?: string; idSelfie?: boolean }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const phone = input.phone?.trim();
  const socialX = input.socialX?.trim().replace(/^@/, "");
  const socialInstagram = input.socialInstagram?.trim().replace(/^@/, "");
  if (phone && phone.replace(/\D/g, "").length < 7) {
    return { error: "Enter a phone number with at least 7 digits." as string };
  }
  // Existing stored contact details count too, so a creator can add the ID step later without retyping everything.
  const hasPhone = !!(phone || user.phone);
  const hasSocial = !!(socialX || socialInstagram || user.socialX || user.socialInstagram);
  let tier = user.kycTier;
  if (hasPhone && hasSocial) tier = Math.max(tier, 1);
  if (input.idSelfie && tier >= 1) tier = Math.max(tier, 2);
  if (tier === user.kycTier && !phone && !socialX && !socialInstagram) {
    return {
      error: input.idSelfie
        ? "Add a phone number and a public X or Instagram handle first (L1), then confirm your ID + selfie."
        : "Nothing to submit. Add a phone number and an X or Instagram handle.",
    };
  }
  await prisma.kycCheck.create({
    data: {
      userId,
      tier,
      status: "approved",
      provider: "mock-persona",
      payload: { phone, socialX, socialInstagram, idSelfie: !!input.idSelfie },
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      phone: phone || user.phone,
      socialX: socialX || user.socialX,
      socialInstagram: socialInstagram || user.socialInstagram,
      kycTier: tier,
      verified: tier >= 2,
    },
  });
  return { tier };
}
