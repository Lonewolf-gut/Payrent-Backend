import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient();
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

export async function runTransaction<T>(
  fn: (db: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction((tx) => fn(tx as PrismaClient));
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let dbReadyAt = 0;
const DB_READY_TTL_MS = 15_000;

/**
 * Lightweight health check before handlers run.
 * Never disconnects the shared Prisma client — concurrent requests share one
 * engine, and disconnect/reconnect races cause "Engine is not yet connected".
 */
export async function ensureDbConnection(retries = 3): Promise<void> {
  if (Date.now() - dbReadyAt < DB_READY_TTL_MS) {
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReadyAt = Date.now();
      return;
    } catch (error) {
      if (attempt === retries) {
        dbReadyAt = 0;
        throw error;
      }
      await sleep(Math.min(attempt * 400, 1500));
    }
  }
}
