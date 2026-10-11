import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { putObject, resolveSafeFsPath } from "@/lib/storage";
import { isSafeHttpUrl, moderateText } from "@bodytag/shared";
import { enqueueImageJobs } from "@/lib/queue";
import { publishCampaign } from "@/lib/redis";
import { allowByIp } from "@/lib/http";
import { sniffImage } from "@/lib/validation";

const ALLOWED_LOGO_MIME_TYPES: Record<string, string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
};

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token" }, { status: 400 });
  const bid = await prisma.bid.findUnique({
    where: { magicToken: token },
    include: { creative: true, slot: true, campaign: { include: { creator: true } } },
  });
  if (!bid) return NextResponse.json({ error: "invalid" }, { status: 404 });
  return NextResponse.json({
    brandName: bid.brandName,
    slot: bid.slot.name,
    campaign: bid.campaign.title,
    handle: bid.campaign.creator.handle,
    slug: bid.campaign.slug,
    creative: bid.creative,
    status: bid.status,
  });
}

export async function POST(req: Request) {
  if (!(await allowByIp(req.headers, "manage", 30, 60))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  }
  const token = String(form.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const bid = await prisma.bid.findUnique({ where: { magicToken: token }, include: { creative: true } });
  if (!bid || bid.status !== "settled") return NextResponse.json({ error: "not current owner" }, { status: 403 });

  const file = form.get("logo");
  let logoKey = bid.creative?.logoKey;

  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo must be under 2 MB" }, { status: 400 });
    }

    const mimeType = file.type.toLowerCase();
    const allowedExts = ALLOWED_LOGO_MIME_TYPES[mimeType];
    if (!allowedExts) {
      return NextResponse.json({ error: "Logo must be a PNG, JPEG, or WebP image" }, { status: 400 });
    }

    const fileExt = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedExts.includes(fileExt)) {
      return NextResponse.json({ error: "File extension does not match permitted image type" }, { status: 400 });
    }

    // Sanitize filename and path to prevent traversal
    const ext = allowedExts[0];
    const key = `logo/${bid.id}/${nanoid()}.${ext}`;

    try {
      resolveSafeFsPath(key);
    } catch {
      return NextResponse.json({ error: "Invalid file path generated" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (sniffImage(bytes) === null) {
      return NextResponse.json({ error: "File is not a valid PNG, JPEG or WebP image" }, { status: 400 });
    }
    await putObject(key, bytes, mimeType);
    logoKey = key;
  }

  const rawUrl = String(form.get("url") ?? "").trim();
  const rawTagline = String(form.get("tagline") ?? "").trim();
  const rawXHandle = String(form.get("xHandle") ?? "").trim();

  if (rawUrl && !isSafeHttpUrl(rawUrl)) {
    return NextResponse.json({ error: "Website URL must start with http:// or https://" }, { status: 400 });
  }

  if (moderateText(rawTagline) || moderateText(rawUrl)) {
    return NextResponse.json({ error: "Content failed moderation policy" }, { status: 400 });
  }

  if (rawTagline.length > 140 || rawXHandle.length > 50) {
    return NextResponse.json({ error: "Tagline or handle is too long" }, { status: 400 });
  }

  await prisma.creative.upsert({
    where: { bidId: bid.id },
    create: {
      bidId: bid.id,
      logoKey: logoKey ?? "",
      tagline: rawTagline || null,
      url: rawUrl || null,
      xHandle: rawXHandle || null,
    },
    update: {
      logoKey: logoKey ?? "",
      tagline: rawTagline || null,
      url: rawUrl || null,
      xHandle: rawXHandle || null,
    },
  });

  await enqueueImageJobs(bid.campaignId, bid.id);
  await publishCampaign(bid.campaignId, {
    type: "creative",
    action: "update",
    bidId: bid.id,
    slotId: bid.slotId,
  });

  return NextResponse.json({ ok: true });
}
