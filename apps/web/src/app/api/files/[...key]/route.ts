import { NextResponse } from "next/server";
import { getObjectStream, resolveSafeFsPath, type ByteRange } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  // Served with nosniff below so an SVG cannot be sniffed/executed as anything else.
  svg: "image/svg+xml",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};

// Keys under these prefixes are nanoid / content-addressed, so a given URL never changes its bytes.
const IMMUTABLE_PREFIXES = ["avatar/", "glb/", "logo/", "photo/", "images/", "audio/", "video/"];

function contentTypeFor(objectKey: string) {
  const name = objectKey.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** Single-range `Range: bytes=…` parser. Returns null for absent/unsupported headers (serve the whole object). */
function parseRange(header: string | null): ByteRange | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") return { suffix: Number(m[2]) };
  const start = Number(m[1]);
  const end = m[2] === "" ? undefined : Number(m[2]);
  if (end !== undefined && end < start) return null;
  return { start, end };
}

export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  if (!key || !Array.isArray(key) || key.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const decodedSegments: string[] = [];
  for (const segment of key) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return NextResponse.json({ error: "invalid key" }, { status: 400 });
    }
    if (
      decoded === ".." ||
      decoded === "." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0")
    ) {
      return NextResponse.json({ error: "invalid key" }, { status: 400 });
    }
    decodedSegments.push(decoded);
  }

  const objectKey = decodedSegments.join("/");
  try {
    resolveSafeFsPath(objectKey);
  } catch {
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  }

  const range = parseRange(req.headers.get("range"));
  let obj: Awaited<ReturnType<typeof getObjectStream>>;
  try {
    obj = await getObjectStream(objectKey, range ?? undefined);
  } catch {
    obj = null;
  }
  if (!obj) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const immutable = IMMUTABLE_PREFIXES.some((p) => objectKey.startsWith(p));
  const headers = new Headers({
    // Extension wins over stored metadata: uploads are sniffed by extension elsewhere and stored
    // metadata may be missing (fs/s3) or a generic octet-stream.
    "content-type": contentTypeFor(objectKey),
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
    // Uploaded files are never documents: lock them down in case one is opened directly.
    "content-security-policy": "default-src 'none'; sandbox",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=60, s-maxage=86400",
  });
  const total = obj.size;
  if (range && typeof total === "number") {
    if (obj.range && obj.range.start >= total) {
      headers.set("content-range", `bytes */${total}`);
      return new Response(null, { status: 416, headers });
    }
    if (obj.range) {
      headers.set("content-range", `bytes ${obj.range.start}-${obj.range.end}/${total}`);
      headers.set("content-length", String(obj.range.end - obj.range.start + 1));
      return new Response(obj.body, { status: 206, headers });
    }
  }
  if (typeof total === "number") headers.set("content-length", String(total));
  return new Response(obj.body, { headers });
}
