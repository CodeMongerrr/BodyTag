import path from "node:path";
import { appConfig } from "./config";
import { cfEnv } from "./runtime";

export type StoredObjectStream = {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  size?: number;
};

export function localRoot() {
  const dir = process.env.STORAGE_DIR ?? "../../data/objects";
  return path.isAbsolute(dir) ? path.resolve(/* turbopackIgnore: true */ dir) : path.resolve(/* turbopackIgnore: true */ process.cwd(), dir);
}

export function resolveSafeFsPath(key: string): string {
  if (!key || typeof key !== "string" || key.includes("\0")) {
    throw new Error("Invalid object key: invalid characters");
  }
  const root = localRoot();
  const resolved = path.resolve(root, key);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
    throw new Error("Invalid storage path: traversal detected");
  }
  return resolved;
}

// node:fs is loaded lazily so this module stays importable on Cloudflare Workers (r2 driver).
async function putFs(key: string, body: Buffer) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const full = resolveSafeFsPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

async function getFs(key: string) {
  const { readFile } = await import("node:fs/promises");
  const full = resolveSafeFsPath(key);
  return readFile(full);
}

async function s3() {
  const { S3Client, PutObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: appConfig.s3.region,
    endpoint: appConfig.s3.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: appConfig.s3.accessKey,
      secretAccessKey: appConfig.s3.secretKey,
    },
  });
  return client;
}

export async function putObject(key: string, body: Buffer, contentType = "application/octet-stream") {
  if (appConfig.storageDriver === "r2") {
    await cfEnv().R2.put(key, body, { httpMetadata: { contentType } });
    return;
  }
  if (appConfig.storageDriver === "s3") {
    const client = await s3();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(
      new PutObjectCommand({
        Bucket: appConfig.s3.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  await putFs(key, body);
}

export async function getObject(key: string) {
  if (key.startsWith("procedural:")) {
    throw new Error("procedural asset");
  }
  if (appConfig.storageDriver === "r2") {
    const obj = await cfEnv().R2.get(key);
    if (!obj) throw new Error("missing object");
    return Buffer.from(await obj.arrayBuffer());
  }
  if (appConfig.storageDriver === "s3") {
    const client = await s3();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const out = await client.send(new GetObjectCommand({ Bucket: appConfig.s3.bucket, Key: key }));
    const bytes = await out.Body?.transformToByteArray();
    if (!bytes) throw new Error("missing object");
    return Buffer.from(bytes);
  }
  return getFs(key);
}

/**
 * Streams an object out without buffering it in memory where the driver supports it (R2).
 * Resolves null when the object does not exist.
 */
export async function getObjectStream(key: string): Promise<StoredObjectStream | null> {
  if (key.startsWith("procedural:")) return null;
  if (appConfig.storageDriver === "r2") {
    const obj = await cfEnv().R2.get(key);
    if (!obj) return null;
    return {
      body: obj.body as unknown as ReadableStream<Uint8Array>,
      contentType: obj.httpMetadata?.contentType,
      size: obj.size,
    };
  }
  let buf: Buffer;
  try {
    buf = await getObject(key);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    size: buf.byteLength,
  };
}

export function publicFileUrl(key: string, version?: string) {
  if (appConfig.cdnBaseUrl) {
    const base = appConfig.cdnBaseUrl.replace(/\/$/, "");
    return version ? `${base}/${key}?v=${version}` : `${base}/${key}`;
  }
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return version ? `/api/files/${encoded}?v=${version}` : `/api/files/${encoded}`;
}

export function imagePublicUrl(campaignId: string, variant: string, version: string) {
  return `/api/images/${campaignId}/${variant}?v=${encodeURIComponent(version)}`;
}
