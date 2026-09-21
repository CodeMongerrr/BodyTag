// Durable Objects that replace Redis on the hosted (Cloudflare Workers) instance. Bundled by wrangler through
// ../../../worker.ts, not by Next, so this file must stay free of "@/…" imports and Node-only packages. The Next
// side talks to these objects via fetch on their stubs (see ./cloudflare.ts).
import { DurableObject } from "cloudflare:workers";

const PRESENCE_INTERVAL_MS = 4000;
const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
} as const;

const encoder = new TextEncoder();

function sseFrame(payload: unknown) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * One instance per campaign (idFromName(campaignId)). Holds the open SSE streams for that campaign in memory and
 * fans published payloads out to them; presence is simply the number of open streams. Nothing is persisted: the
 * open streams keep the object alive, and an evicted object has no viewers left to remember.
 */
export class CampaignHub extends DurableObject {
  private writers = new Map<number, WritableStreamDefaultWriter<Uint8Array>>();
  private nextWriterId = 1;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok");
    }

    if (request.method === "POST" && url.pathname === "/publish") {
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return new Response("invalid JSON", { status: 400 });
      }
      this.broadcast(sseFrame(payload));
      return Response.json({ ok: true, viewers: this.writers.size });
    }

    if (request.method === "GET" && url.pathname === "/events") {
      // The object is addressed by idFromName(campaignId), so the id's name is the campaign; the query param is a
      // fallback for callers that reached it another way.
      return this.openStream(this.ctx.id.name ?? url.searchParams.get("campaignId") ?? "");
    }

    return new Response("not found", { status: 404 });
  }

  private openStream(campaignId: string): Response {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const id = this.nextWriterId++;
    this.writers.set(id, writer);

    // If the client goes away the runtime cancels `readable`, which rejects the writer's `closed` promise.
    writer.closed.catch(() => undefined).finally(() => this.dropWriter(id));

    // Fire-and-forget: a failed write means the stream is gone and `closed` above will clean up.
    writer.write(sseFrame({ type: "hello", campaignId })).catch(() => undefined);
    writer.write(sseFrame({ type: "presence", viewers: this.writers.size })).catch(() => undefined);
    this.ensurePresenceTimer();

    return new Response(readable, { headers: SSE_HEADERS });
  }

  private dropWriter(id: number) {
    const writer = this.writers.get(id);
    if (!writer) return;
    this.writers.delete(id);
    writer.close().catch(() => undefined);
    if (this.writers.size === 0 && this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
  }

  private ensurePresenceTimer() {
    if (this.presenceTimer) return;
    this.presenceTimer = setInterval(() => {
      this.broadcast(sseFrame({ type: "presence", viewers: this.writers.size }));
    }, PRESENCE_INTERVAL_MS);
  }

  private broadcast(frame: Uint8Array) {
    for (const [id, writer] of this.writers) {
      writer.write(frame).catch(() => this.dropWriter(id));
    }
  }
}

interface RateWindow {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter, one object per rate-limit key (idFromName(key)). Mirrors the Redis INCR + EXPIRE pattern in
 * ./node-redis.ts: the first hit in a window starts it, later hits increment, and the window is dropped once it
 * has expired.
 */
export class RateLimiter extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/check") {
      return new Response("not found", { status: 404 });
    }

    let body: { key?: unknown; limit?: unknown; windowSec?: unknown };
    try {
      body = await request.json();
    } catch {
      return new Response("invalid JSON", { status: 400 });
    }
    const limit = Number(body.limit);
    const windowSec = Number(body.windowSec);
    if (!Number.isFinite(limit) || !Number.isFinite(windowSec) || windowSec <= 0) {
      return new Response("limit and windowSec must be positive numbers", { status: 400 });
    }

    const now = Date.now();
    const current = await this.ctx.storage.get<RateWindow>("window");
    const window: RateWindow =
      current && current.resetAt > now ? { count: current.count + 1, resetAt: current.resetAt } : { count: 1, resetAt: now + windowSec * 1000 };
    await this.ctx.storage.put("window", window);

    return Response.json({ ok: window.count <= limit, count: window.count, resetAt: window.resetAt });
  }
}
