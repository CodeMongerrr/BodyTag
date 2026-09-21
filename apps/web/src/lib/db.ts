import { prisma as nodePrisma, type PrismaClient } from "@bodytag/db";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { cfCtx, cfEnv, isCloudflare } from "@/lib/runtime";

/**
 * Cloudflare Workers cannot share sockets between requests, so each request gets its own PrismaClient
 * backed by a pg pool that Hyperdrive fronts (HYPERDRIVE.connectionString is a local proxy URL). The
 * client is cached per ExecutionContext so the ~30 importers of `prisma` share one within a request.
 */
const workersClients = new WeakMap<ExecutionContext, PrismaClient>();

function workersClient(): PrismaClient {
  const ctx = cfCtx();
  let client = workersClients.get(ctx);
  if (!client) {
    // Workers allow 6 concurrent outbound connections; leave headroom for R2/fetch.
    const adapter = new PrismaPg({ connectionString: cfEnv().HYPERDRIVE.connectionString, max: 5 });
    // The WASM query engine, explicitly. The generated client's export map lists the `node` condition before
    // `workerd` and OpenNext bundles with platform=node, so a plain `@prisma/client` import would pick the
    // native engine. `require` (not `import`) because only the CommonJS entry of "./wasm" ships.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient: PrismaClientWasm } = require("@prisma/client/wasm") as typeof import("@prisma/client/wasm");
    client = new PrismaClientWasm({ adapter, log: ["error"] }) as unknown as PrismaClient;
    workersClients.set(ctx, client);
  }
  return client;
}

function currentClient(): PrismaClient {
  return isCloudflare() ? workersClient() : nodePrisma;
}

/**
 * Same import for every caller on both hosts: on Node this is @bodytag/db's lazy singleton, on Workers the
 * current request's client. Methods are bound to the real client so `prisma.$transaction(...)`,
 * prisma.$queryRaw`...` and model delegates (`prisma.user.findMany`) all work through the Proxy.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = currentClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, prop) {
    return Reflect.has(currentClient(), prop);
  },
});
