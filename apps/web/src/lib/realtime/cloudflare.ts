// Cloudflare Workers realtime/rate-limit backend. Talks to the Durable Objects in ./durable-objects.ts over their
// stubs; ../redis.ts picks this module when isCloudflare() is true. Stubs are cheap handles, so nothing is cached
// across requests here.
import type { DurableObjectStub } from "@cloudflare/workers-types";
import { cfCtx, cfEnv } from "../runtime";

// The hostname is only there to make the URL absolute; the objects route on the path.
const HUB_ORIGIN = "https://hub";

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
};

function campaignHub(campaignId: string): DurableObjectStub {
  const ns = cfEnv().CAMPAIGN_HUB;
  return ns.get(ns.idFromName(campaignId));
}

function rateLimiter(key: string): DurableObjectStub {
  const ns = cfEnv().RATE_LIMITER;
  return ns.get(ns.idFromName(key));
}

export async function redisPing() {
  // There is no Redis on the hosted instance; the Durable Objects are part of the Worker itself.
  return true;
}

export async function publishCampaign(campaignId: string, payload: unknown) {
  try {
    const publish = campaignHub(campaignId)
      .fetch(`${HUB_ORIGIN}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      .then(() => undefined, () => undefined);
    // Let the response go out without waiting on the fan-out; the runtime keeps the Worker alive until it settles.
    cfCtx().waitUntil(publish);
  } catch {
    // fail open for page views (no execution context, binding missing, …)
  }
}

/* eslint-disable @typescript-eslint/no-unused-vars -- signature parity with ./node-redis.ts */
export function subscribeCampaign(_campaignId: string, _listener: (payload: unknown) => void): () => void {
  throw new Error("use the CampaignHub SSE proxy on Cloudflare (campaignEventsResponse)");
}

// Presence lives in the CampaignHub (it counts its open SSE streams), so these are no-ops on Cloudflare.
export async function touchViewer(_campaignId: string, _viewerId?: string) {
  return 0;
}

export async function removeViewer(_campaignId: string, _viewerId: string) {
  return 0;
}

export async function incrViewers(_campaignId: string, _viewerId?: string) {
  return 0;
}
/* eslint-enable @typescript-eslint/no-unused-vars */

export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const res = await rateLimiter(key).fetch(`${HUB_ORIGIN}/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, limit, windowSec }),
    });
    if (!res.ok) return true;
    const data = (await res.json()) as { ok?: unknown };
    return data.ok !== false;
  } catch {
    // Fail open if the limiter is unavailable
    return true;
  }
}

/**
 * The Cloudflare equivalent of the Node SSE route: proxies the campaign's CampaignHub `/events` stream straight
 * through. Closing the client connection cancels the proxied body, which the hub sees as the stream going away.
 */
export async function campaignEventsResponse(campaignId: string, signal: AbortSignal): Promise<Response> {
  const upstream = await campaignHub(campaignId).fetch(`${HUB_ORIGIN}/events?campaignId=${encodeURIComponent(campaignId)}`, {
    method: "GET",
    // Workers' RequestInit and the DOM one are structurally equivalent here; the type-only import keeps them apart.
    signal: signal as unknown as import("@cloudflare/workers-types").AbortSignal,
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("campaign hub unavailable", { status: 503 });
  }
  return new Response(upstream.body as unknown as ReadableStream<Uint8Array>, { headers: SSE_HEADERS });
}
