import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const GET = withAuth(async (req, _ctx, session) => {
  if (process.env.NODE_ENV !== "development" && process.env.SHOW_DEV_OTP !== "true") {
    return apiResponse({ error: "Not found" }, 404);
  }

  const purpose = req.nextUrl.searchParams.get("purpose") ?? "PHONE_VERIFY";

  const pending = await prisma.otpCode.findFirst({
    where: {
      userId: session.user.id,
      purpose,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });

  return apiResponse({
    code: pending?.code ?? null,
    devCode: pending?.code ?? null,
    isDevelopment: true,
  });
});
