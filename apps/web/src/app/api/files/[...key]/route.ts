import { NextResponse } from "next/server";
import { getObjectStream, resolveSafeFsPath } from "@/lib/storage";

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

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
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

  let obj: Awaited<ReturnType<typeof getObjectStream>>;
  try {
    obj = await getObjectStream(objectKey);
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
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=60, s-maxage=86400",
  });
  if (typeof obj.size === "number") headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
}
