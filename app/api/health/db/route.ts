import { apiResponse, withPublicHandler } from "@/lib/api/handler";
import { ensureDbConnection, prisma } from "@/lib/db/prisma";

export const GET = withPublicHandler(async () => {
  await ensureDbConnection();

  const [userCount, propertyCount, verificationCount] = await Promise.all([
    prisma.user.count(),
    prisma.property.count(),
    prisma.verification.count(),
  ]);

  const databaseHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").host || "unknown";
    } catch {
      return "invalid-database-url";
    }
  })();

  return apiResponse({
    ok: true,
    databaseHost,
    counts: {
      users: userCount,
      properties: propertyCount,
      verifications: verificationCount,
    },
  });
});
