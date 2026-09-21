import type { Queue } from "bullmq";
import { IMAGE_VARIANTS } from "@bodytag/shared";
import { prisma } from "./db";
import { appConfig } from "./config";
import { cfEnv, isCloudflare } from "./runtime";

const globalForQueue = globalThis as unknown as { queue?: Queue };

// bullmq/ioredis are Node-only; loaded lazily so the Workers bundle never reaches them.
async function getQueue() {
  if (!globalForQueue.queue) {
    const [{ Queue }, { getRedisQueue }] = await Promise.all([import("bullmq"), import("./redis")]);
    globalForQueue.queue = new Queue(appConfig.imageQueue, {
      connection: getRedisQueue(),
    });
  }
  return globalForQueue.queue;
}

/** Hosted instance: hand the job to the Cloudflare Queue consumed by apps/worker-images-cf. */
async function sendToCfQueue(imageJobId: string) {
  try {
    await cfEnv().IMAGE_QUEUE.send({ imageJobId });
  } catch {
    // Queue unavailable: the row stays queued and the images route serves the placeholder
  }
}

export async function enqueueImageJobs(campaignId: string, bidId?: string) {
  for (const variant of IMAGE_VARIANTS.filter((v) => v !== "slot_crop")) {
    const idempotencyKey = `${campaignId}:${bidId ?? "base"}:${variant}`;
    const job = await prisma.imageJob.upsert({
      where: { idempotencyKey },
      update: { status: "queued", bidId },
      create: { campaignId, bidId, variant, idempotencyKey, status: "queued" },
    });
    if (isCloudflare()) {
      await sendToCfQueue(job.id);
      continue;
    }
    try {
      const q = await getQueue();
      const existing = await q.getJob(idempotencyKey);
      if (existing) {
        await existing.remove().catch(() => undefined);
      }
      await q.add(
        "render",
        { imageJobId: job.id },
        { jobId: idempotencyKey, removeOnComplete: 100, attempts: 5, backoff: { type: "exponential", delay: 2000 } },
      );
    } catch {
      // Redis down: lazy generate on GET
    }
  }
}

const LAZY_JOB_FRESH_MS = 2 * 60 * 1000;

export async function ensureVariant(campaignId: string, variant: string) {
  const existing = await prisma.imageJob.findFirst({
    where: { campaignId, variant, status: "done" },
    orderBy: { updatedAt: "desc" },
  });
  if (existing?.outputKey) return existing;
  if (isCloudflare()) {
    // No sharp on Workers: queue the render and return the pending row (no outputKey) so the caller can
    // serve a placeholder. A recent queued/running job is reused instead of flooding the queue.
    const pending = await prisma.imageJob.findFirst({
      where: {
        campaignId,
        variant,
        status: { in: ["queued", "running"] },
        updatedAt: { gte: new Date(Date.now() - LAZY_JOB_FRESH_MS) },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (pending) return pending;
    const job = await prisma.imageJob.create({
      data: { campaignId, variant, idempotencyKey: `${campaignId}:lazy:${variant}:${Date.now()}`, status: "queued" },
    });
    await sendToCfQueue(job.id);
    return job;
  }
  const idempotencyKey = `${campaignId}:lazy:${variant}:${Date.now()}`;
  const job = await prisma.imageJob.create({
    data: { campaignId, variant, idempotencyKey, status: "queued" },
  });
  const { processImageJob } = await import("./images/process");
  await processImageJob(job.id);
  return prisma.imageJob.findUniqueOrThrow({ where: { id: job.id } });
}
