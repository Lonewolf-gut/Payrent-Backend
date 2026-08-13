import { prisma } from "@/lib/db/prisma";
import { shouldExposeOtpCodes } from "@/lib/auth/expose-otp";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const GET = withAuth(async (req, _ctx, session) => {
  if (!shouldExposeOtpCodes()) {
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
    purpose,
  });
});
