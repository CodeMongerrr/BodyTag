// Node-only realtime/rate-limit backend (ioredis). Only ever loaded through `await import()` from ../redis.ts on
// the Node branch, so the top-level ioredis import never reaches the Cloudflare bundle; the hosted instance uses
// ./cloudflare.ts (Durable Objects) instead.
import EventEmitter from "node:events";
import Redis from "ioredis";
import { nanoid } from "nanoid";
import { appConfig } from "../config";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
  redisSub?: Redis;
  redisQueue?: Redis;
};

function connect() {
  return new Redis(appConfig.redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

export function getRedis() {
  if (!globalForRedis.redis) globalForRedis.redis = connect();
  return globalForRedis.redis;
}

export function getRedisSub() {
  if (!globalForRedis.redisSub) globalForRedis.redisSub = connect();
  return globalForRedis.redisSub;
}

export function getRedisQueue() {
  if (!globalForRedis.redisQueue) {
    globalForRedis.redisQueue = new Redis(appConfig.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });
  }
  return globalForRedis.redisQueue;
}

export async function redisPing() {
  try {
    const pong = await getRedis().ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

export async function publishCampaign(campaignId: string, payload: unknown) {
  try {
    await getRedis().publish(`campaign:${campaignId}`, JSON.stringify(payload));
  } catch {
    // fail open for page views
  }
}

type CampaignListener = (payload: unknown) => void;

interface FanoutState {
  emitter: EventEmitter;
  channelCounts: Map<string, number>;
  initialized: boolean;
}

const globalForFanout = globalThis as unknown as {
  fanoutState?: FanoutState;
};

function getFanoutState(): FanoutState {
  if (!globalForFanout.fanoutState) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    globalForFanout.fanoutState = {
      emitter,
      channelCounts: new Map<string, number>(),
      initialized: false,
    };
  }
  return globalForFanout.fanoutState;
}

export function subscribeCampaign(campaignId: string, listener: CampaignListener): () => void {
  const state = getFanoutState();
  const channel = `campaign:${campaignId}`;
  const sub = getRedisSub();

  if (!state.initialized) {
    state.initialized = true;
    sub.on("message", (msgChannel: string, message: string) => {
      try {
        const parsed = JSON.parse(message);
        state.emitter.emit(msgChannel, parsed);
      } catch {
        state.emitter.emit(msgChannel, { raw: message });
      }
    });
  }

  const currentCount = state.channelCounts.get(channel) ?? 0;
  if (currentCount === 0) {
    sub.subscribe(channel).catch((err) => {
      console.error(`Failed to subscribe to Redis channel ${channel}:`, err);
    });
  }
  state.channelCounts.set(channel, currentCount + 1);

  state.emitter.on(channel, listener);

  let cleanedUp = false;
  return () => {
    if (cleanedUp) return;
    cleanedUp = true;
    state.emitter.off(channel, listener);
    const count = (state.channelCounts.get(channel) ?? 1) - 1;
    if (count <= 0) {
      state.channelCounts.delete(channel);
      sub.unsubscribe(channel).catch(() => undefined);
    } else {
      state.channelCounts.set(channel, count);
    }
  };
}

export async function touchViewer(campaignId: string, viewerId?: string) {
  const key = `viewers:${campaignId}`;
  const now = Date.now();
  const id = viewerId && viewerId !== "anon" ? viewerId : nanoid(10);
  try {
    const r = getRedis();
    await r.zadd(key, now, id);
    await r.zremrangebyscore(key, 0, now - 35_000);
    await r.expire(key, 60);
    return await r.zcard(key);
  } catch {
    return 1;
  }
}

export async function removeViewer(campaignId: string, viewerId: string) {
  const key = `viewers:${campaignId}`;
  try {
    const r = getRedis();
    await r.zrem(key, viewerId);
    return await r.zcard(key);
  } catch {
    return 0;
  }
}

export async function incrViewers(campaignId: string, viewerId?: string) {
  return touchViewer(campaignId, viewerId);
}

export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const r = getRedis();
    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, windowSec);
    }
    return count <= limit;
  } catch {
    // Fail open if Redis is unavailable
    return true;
  }
}

