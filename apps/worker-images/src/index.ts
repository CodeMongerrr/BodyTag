import http from "node:http";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processImageJob } from "./process";
import { prisma } from "@bodytag/db";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const queue = process.env.IMAGE_QUEUE ?? "bodytag-images";

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker(
  queue,
  async (job) => {
    await processImageJob(job.data.imageJobId);
  },
  { connection, concurrency: 2 },
);

worker.on("failed", (job, err) => {
  console.error("image job failed", job?.id, err);
});

const server = http.createServer(async (_req, res) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  res.writeHead(db ? 200 : 503, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: db, db, worker: "images" }));
});

server.listen(9091, "0.0.0.0", () => {
  console.log("worker-images listening :9091");
});
