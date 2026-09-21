import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { putObject, resolveSafeFsPath } from "@/lib/storage";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/redis";

type UploadRule = {
  maxSize: number;
  allowedMimes: Record<string, string[]>;
  /** Creator-only asset kinds. Brands upload logos anonymously during checkout, so `logo` stays open. */
  requiresAuth?: boolean;
};

const UPLOAD_RULES: Record<string, UploadRule> = {
  logo: {
    maxSize: 2 * 1024 * 1024,
    allowedMimes: {
      "image/png": ["png"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/webp": ["webp"],
    },
  },
  photo: {
    maxSize: 8 * 1024 * 1024,
    requiresAuth: true,
    allowedMimes: {
      "image/png": ["png"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/webp": ["webp"],
    },
  },
  glb: {
    maxSize: 8 * 1024 * 1024,
    requiresAuth: true,
    allowedMimes: {
      "model/gltf-binary": ["glb"],
      "model/gltf+json": ["gltf"],
      "application/octet-stream": ["glb", "gltf"],
    },
  },
  // Avaturn exports are uncompressed glTF 2.0 with ~27 embedded 1K textures (measured ~14 MB).
  avatar: {
    maxSize: 40 * 1024 * 1024,
    requiresAuth: true,
    allowedMimes: {
      "model/gltf-binary": ["glb"],
      "application/octet-stream": ["glb"],
    },
  },
  audio: {
    maxSize: 8 * 1024 * 1024,
    requiresAuth: true,
    allowedMimes: {
      "audio/mpeg": ["mp3"],
      "audio/mp3": ["mp3"],
      "audio/wav": ["wav"],
      "audio/ogg": ["ogg"],
    },
  },
  video: {
    maxSize: 8 * 1024 * 1024,
    requiresAuth: true,
    allowedMimes: {
      "video/mp4": ["mp4"],
      "video/webm": ["webm"],
    },
  },
  proof: {
    maxSize: 8 * 1024 * 1024,
    allowedMimes: {
      "image/png": ["png"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/webp": ["webp"],
      "application/pdf": ["pdf"],
      "video/mp4": ["mp4"],
    },
  },
};

/**
 * Structural check for a single-file glTF 2.0 binary: header magic/version/length, a JSON first chunk that parses,
 * and no external buffer/image URIs (we serve avatars as one object, so anything external would 404 in the arena).
 */
function isGlb(buf: Buffer) {
  if (buf.length < 20) return false;
  if (buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2 || buf.readUInt32LE(8) !== buf.length) return false;
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLen > buf.length) return false;
  try {
    const doc = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8")) as {
      asset?: { version?: string };
      buffers?: Array<{ uri?: string }>;
      images?: Array<{ uri?: string }>;
    };
    if (doc.asset?.version !== "2.0") return false;
    const external = [...(doc.buffers ?? []), ...(doc.images ?? [])].some((x) => x.uri && !x.uri.startsWith("data:"));
    return !external;
  } catch {
    return false;
  }
}

const MAX_UPLOAD = Math.max(...Object.values(UPLOAD_RULES).map((r) => r.maxSize));

export async function POST(req: Request) {
  // Reject oversized bodies before buffering multipart data.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD + 64 * 1024) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const session = await getSession();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!(await checkRateLimit(`ratelimit:upload:${session?.userId ?? ip}`, 30, 60))) {
    return NextResponse.json({ error: "Too many uploads, try again in a minute" }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });

  const kind = String(form.get("kind") ?? "logo").toLowerCase().trim();
  const rule = UPLOAD_RULES[kind];
  if (!rule) {
    return NextResponse.json({ error: "Invalid upload kind" }, { status: 400 });
  }
  if (rule.requiresAuth && !session) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  if (file.size > rule.maxSize) {
    return NextResponse.json(
      { error: `File size exceeds limit of ${rule.maxSize / (1024 * 1024)} MB` },
      { status: 400 },
    );
  }

  const rawExt = file.name.split(".").pop()?.toLowerCase().trim() ?? "";
  if (!rawExt || rawExt.includes("/") || rawExt.includes("\\") || rawExt.includes("\0")) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  const mime = file.type.toLowerCase();
  const validExts = rule.allowedMimes[mime];
  if (!validExts || !validExts.includes(rawExt)) {
    return NextResponse.json(
      { error: `Invalid file type (${file.type || "unknown"}) or extension (.${rawExt}) for ${kind}` },
      { status: 400 },
    );
  }

  const userFolder = session?.userId ? session.userId.replace(/[^a-zA-Z0-9_-]/g, "") : "public";
  const key = `${kind}/${userFolder}/${nanoid()}.${rawExt}`;

  try {
    resolveSafeFsPath(key);
  } catch {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (rawExt === "glb" && !isGlb(buf)) {
    return NextResponse.json({ error: "Not a binary glTF file" }, { status: 400 });
  }
  await putObject(key, buf, mime);

  return NextResponse.json({ key, url: `/api/files/${key}` });
}
