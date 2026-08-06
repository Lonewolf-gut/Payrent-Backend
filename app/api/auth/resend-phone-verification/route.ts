import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { authService } from "@/lib/services/auth.service";
import { apiResponse, withAuth } from "@/lib/api/handler";

const phoneInputSchema = z.object({
  phone: z.string().trim().min(10).max(15).optional(),
});

function buildStatusPayload(pendingCode: string | null, phone: string | null) {
  const smsProvider = (process.env.SMS_PROVIDER || "log").trim().toLowerCase();
  const isDevelopment = process.env.NODE_ENV === "development";

  return {
    phone,
    hasPendingCode: Boolean(pendingCode),
    devCode: isDevelopment && pendingCode ? pendingCode : null,
    code: isDevelopment && pendingCode ? pendingCode : null,
    smsConfigured: smsProvider !== "log",
    isDevelopment,
  };
}

export const GET = withAuth(async (_req, _ctx, session) => {
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { phone: true },
  });

  const pending = await prisma.otpCode.findFirst({
    where: {
      userId: session.user.id,
      purpose: "PHONE_VERIFY",
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });

  return apiResponse(buildStatusPayload(pending?.code ?? null, user?.phone ?? null));
});

export const POST = withAuth(async (req, _ctx, session) => {
  const body = await req.json().catch(() => ({}));
  const parsed = phoneInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiResponse({ error: parsed.error.flatten() }, 400);
  }

  const result = await authService.requestPhoneVerification(
    session.user.id,
    parsed.data.phone
  );

  const smsProvider = result.smsProvider;
  const isDevelopment = process.env.NODE_ENV === "development";

  return apiResponse({
    phone: result.phone,
    sent: smsProvider !== "log",
    devCode: isDevelopment ? result.code : null,
    code: isDevelopment ? result.code : null,
    smsConfigured: smsProvider !== "log",
    isDevelopment,
  });
});
