import { getCloudflareContext } from "@opennextjs/cloudflare";
import type {
  DurableObjectNamespace,
  ExecutionContext,
  Fetcher,
  Hyperdrive,
  Queue,
  R2Bucket,
} from "@cloudflare/workers-types";

/**
 * Which host we are running on. BodyTag self-hosts on Node (Compose / Fly / K8s) and runs the official
 * hosted instance on Cloudflare Workers; the storage, realtime, image and database modules switch on this.
 */
export function isCloudflare(): boolean {
  if (process.env.BODYTAG_RUNTIME === "cloudflare") return true;
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/** Bindings declared in apps/web/wrangler.jsonc (type-only imports keep Workers globals out of the Next tsconfig). */
export type CfEnv = {
  R2: R2Bucket;
  HYPERDRIVE: Hyperdrive;
  CAMPAIGN_HUB: DurableObjectNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  IMAGE_QUEUE: Queue<{ imageJobId: string }>;
  ASSETS: Fetcher;
};

export function cfEnv(): CfEnv {
  return getCloudflareContext().env as unknown as CfEnv;
}

export function cfCtx(): ExecutionContext {
  return getCloudflareContext().ctx as unknown as ExecutionContext;
}
