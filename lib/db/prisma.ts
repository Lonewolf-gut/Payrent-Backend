import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaHealthCheckedAt?: number;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

export async function runTransaction<T>(
  fn: (db: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction((tx) => fn(tx as PrismaClient));
}

const HEALTH_CHECK_TTL_MS = 30_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lightweight health check before API handlers run.
 * Cached briefly so parallel admin dashboard requests do not each grab a DB connection.
 * Never disconnects the shared client — that breaks concurrent requests under pool limits.
 */
export async function ensureDbConnection(retries = 3): Promise<void> {
  const now = Date.now();
  if (
    globalForPrisma.prismaHealthCheckedAt &&
    now - globalForPrisma.prismaHealthCheckedAt < HEALTH_CHECK_TTL_MS
  ) {
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      globalForPrisma.prismaHealthCheckedAt = Date.now();
      return;
    } catch (error) {
      if (attempt === retries) {
        globalForPrisma.prismaHealthCheckedAt = undefined;
        throw error;
      }
      await sleep(Math.min(attempt * 500, 2000));
    }
  }
}
