import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma over Hyperdrive. Workers must not share sockets across invocations, so the caller creates one
 * client per queue batch and disconnects it when the batch is done.
 */
export function createDb(env: Env) {
  const adapter = new PrismaPg({ connectionString: env.HYPERDRIVE.connectionString, max: 2 });
  return new PrismaClient({ adapter, log: ["error"] });
}

export type Db = ReturnType<typeof createDb>;
