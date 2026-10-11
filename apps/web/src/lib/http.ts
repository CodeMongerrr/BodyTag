import { checkRateLimit } from "./redis";

/** Best-effort client IP for rate limiting (Cloudflare first, then standard proxy headers). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/**
 * Per-IP fixed-window limit. Returns true when the request may proceed. With no proxy headers (direct self-host)
 * every visitor would share one "unknown" bucket and lock each other out, so an unknown IP is not limited here.
 */
export async function allowByIp(headers: Headers, name: string, limit: number, windowSec: number): Promise<boolean> {
  const ip = clientIp(headers);
  if (ip === "unknown") return true;
  return checkRateLimit(`ratelimit:${name}:${ip}`, limit, windowSec);
}
