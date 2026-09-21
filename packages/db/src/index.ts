import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Driver adapter accepted by the PrismaClient constructor (e.g. `new PrismaPg({ connectionString })`).
 * Driver adapters are GA in Prisma 6.19, so no preview flag is needed in schema.prisma.
 */
export type PrismaAdapter = NonNullable<Prisma.PrismaClientOptions["adapter"]>;

export type CreatePrismaClientOptions = {
  /** Pass a driver adapter to bypass the native engine (Cloudflare Workers via Hyperdrive). Omit for Node. */
  adapter?: PrismaAdapter;
  log?: Prisma.PrismaClientOptions["log"];
};

/** Constructs a fresh PrismaClient. Callers on Workers must scope the client to a single request. */
export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  // Prisma rejects an explicit `adapter: undefined` (it wants null or the key absent), so only spread it when set.
  return new PrismaClient({
    ...(options.adapter ? { adapter: options.adapter } : {}),
    log: options.log ?? (process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]),
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let moduleSingleton: PrismaClient | undefined;

/** The adapter-less Node singleton, constructed on first use; cached on globalThis in dev so HMR reloads reuse it. */
function nodeSingleton(): PrismaClient {
  moduleSingleton ??= globalForPrisma.prisma ?? createPrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = moduleSingleton;
  return moduleSingleton;
}

/**
 * Lazy Node singleton: importing this module never constructs a client (so the Workers build can import
 * the enums and types without touching the native engine); the first property access does. Methods are
 * bound so `prisma.$transaction(...)` and tagged templates like prisma.$queryRaw`...` work through the Proxy.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = nodeSingleton();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, prop) {
    return Reflect.has(nodeSingleton(), prop);
  },
});

export { PrismaClient };
export type { Prisma } from "@prisma/client";
export { CampaignTheme, CampaignStatus, BidStatus, StakeStatus, ImageJobStatus } from "@prisma/client";
