// Realtime, presence and rate-limit facade. Self-hosted Node keeps ioredis (./realtime/node-redis, loaded only
// through a dynamic import so ioredis never enters the Workers bundle); the hosted Cloudflare instance uses
// Durable Objects (./realtime/cloudflare). Every export here keeps the name and call shape callers already use.
import type Redis from "ioredis";
import type { RedisOptions } from "ioredis";
import { appConfig } from "./config";
import { isCloudflare } from "./runtime";
import * as cloudflare from "./realtime/cloudflare";

type NodeRedis = typeof import("./realtime/node-redis");

const globalForBackend = globalThis as unknown as {
  nodeRedisModule?: Promise<NodeRedis>;
};

function nodeRedis(): Promise<NodeRedis> {
  if (isCloudflare()) {
    return Promise.reject(new Error("Redis is not available on Cloudflare; this code path is Node-only (BullMQ)"));
  }
  if (!globalForBackend.nodeRedisModule) {
    globalForBackend.nodeRedisModule = import("./realtime/node-redis");
  }
  return globalForBackend.nodeRedisModule;
}

// Raw connections are Node-only; on Cloudflare these reject with a clear message.
export async function getRedis(): Promise<Redis> {
  return (await nodeRedis()).getRedis();
}

export async function getRedisSub(): Promise<Redis> {
  return (await nodeRedis()).getRedisSub();
}

/**
 * BullMQ connection settings (queue.ts passes this straight to `new Queue(..., { connection })`). Stays synchronous
 * by handing BullMQ the same url + options the old shared client was built from; BullMQ constructs an identical
 * ioredis client itself. Throws on Cloudflare, where images go through the IMAGE_QUEUE binding instead.
 */
export function getRedisQueue(): RedisOptions & { url: string } {
  if (isCloudflare()) {
    throw new Error("Redis is not available on Cloudflare; BullMQ is Node-only (use the IMAGE_QUEUE binding)");
  }
  return {
    url: appConfig.redisUrl,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  };
}

export async function redisPing() {
  if (isCloudflare()) return cloudflare.redisPing();
  try {
    return await (await nodeRedis()).redisPing();
  } catch {
    return false;
  }
}

export async function publishCampaign(campaignId: string, payload: unknown) {
  if (isCloudflare()) return cloudflare.publishCampaign(campaignId, payload);
  try {
    await (await nodeRedis()).publishCampaign(campaignId, payload);
  } catch {
    // fail open for page views
  }
}

type CampaignListener = (payload: unknown) => void;

/**
 * Sync facade over the Node subscriber: the ioredis module loads asynchronously, so the subscription is attached as
 * soon as it resolves (the Redis SUBSCRIBE itself was always asynchronous) and the returned function unsubscribes
 * whether or not that has happened yet. On Cloudflare this throws; the SSE route proxies the CampaignHub instead.
 */
export function subscribeCampaign(campaignId: string, listener: CampaignListener): () => void {
  if (isCloudflare()) return cloudflare.subscribeCampaign(campaignId, listener);

  let cleanedUp = false;
  let unsubscribe: (() => void) | undefined;
  nodeRedis()
    .then((mod) => {
      if (cleanedUp) return;
      unsubscribe = mod.subscribeCampaign(campaignId, listener);
    })
    .catch((err) => {
      console.error(`Failed to subscribe to campaign ${campaignId}:`, err);
    });

  return () => {
    if (cleanedUp) return;
    cleanedUp = true;
    unsubscribe?.();
  };
}

export async function touchViewer(campaignId: string, viewerId?: string) {
  if (isCloudflare()) return cloudflare.touchViewer(campaignId, viewerId);
  try {
    return await (await nodeRedis()).touchViewer(campaignId, viewerId);
  } catch {
    return 1;
  }
}

export async function removeViewer(campaignId: string, viewerId: string) {
  if (isCloudflare()) return cloudflare.removeViewer(campaignId, viewerId);
  try {
    return await (await nodeRedis()).removeViewer(campaignId, viewerId);
  } catch {
    return 0;
  }
}

export async function incrViewers(campaignId: string, viewerId?: string) {
  if (isCloudflare()) return cloudflare.incrViewers(campaignId, viewerId);
  return touchViewer(campaignId, viewerId);
}

export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  if (isCloudflare()) return cloudflare.checkRateLimit(key, limit, windowSec);
  try {
    return await (await nodeRedis()).checkRateLimit(key, limit, windowSec);
  } catch {
    // Fail open if Redis is unavailable
    return true;
  }
}
