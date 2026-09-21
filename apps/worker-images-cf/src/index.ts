// Queue consumer for "bodytag-images". apps/web (hosted, Cloudflare) enqueues { imageJobId } per variant;
// this worker renders the PNG into R2 and flips the ImageJob row to done/failed. Self-hosted installs run
// apps/worker-images (BullMQ + sharp) instead.
import { createDb } from "./db";
import { processImageJob } from "./process";
import { r2Storage } from "./storage";

type ImageMessage = { imageJobId: string };

export default {
  async queue(batch: MessageBatch<ImageMessage>, env: Env): Promise<void> {
    const prisma = createDb(env);
    const storage = r2Storage(env.R2);
    try {
      for (const message of batch.messages) {
        const imageJobId = message.body?.imageJobId;
        if (!imageJobId) {
          message.ack(); // malformed: retrying would never help
          continue;
        }
        try {
          await processImageJob(imageJobId, { prisma, storage });
          message.ack();
        } catch (e) {
          console.error("image job failed", imageJobId, e);
          message.retry({ delaySeconds: Math.min(300, 2 ** message.attempts * 2) });
        }
      }
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
  },
} satisfies ExportedHandler<Env, ImageMessage>;
