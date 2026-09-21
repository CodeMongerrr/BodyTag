import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const driver = process.env.STORAGE_DRIVER ?? "fs";

function root() {
  return path.resolve(process.cwd(), process.env.STORAGE_DIR ?? "../../data/objects");
}

export async function getObject(key: string) {
  if (driver === "s3") {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "bodytag",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "bodytagsecret",
      },
    });
    const out = await client.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET ?? "bodytag", Key: key }),
    );
    const bytes = await out.Body?.transformToByteArray();
    if (!bytes) throw new Error("missing");
    return Buffer.from(bytes);
  }
  return readFile(path.join(root(), key));
}

export async function putObject(key: string, body: Buffer, contentType = "image/png") {
  if (driver === "s3") {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "bodytag",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "bodytagsecret",
      },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET ?? "bodytag",
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}
