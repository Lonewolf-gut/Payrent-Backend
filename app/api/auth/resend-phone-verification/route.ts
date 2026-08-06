import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { authService } from "@/lib/services/auth.service";
import { apiResponse, withAuth } from "@/lib/api/handler";

const phoneInputSchema = z.object({
  phone: z.string().trim().min(10).max(15).optional(),
});

function isDevEnvironment() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.SHOW_DEV_OTP === "true"
  );
}

function isSmsConfigured() {
  const smsProvider = (process.env.SMS_PROVIDER || "log").trim().toLowerCase();
  return smsProvider !== "log";
}

function buildStatusPayload(pendingCode: string | null, phone: string | null) {
  const smsConfigured = isSmsConfigured();
  const isDevelopment = isDevEnvironment();

  return {
    phone,
    hasPendingCode: Boolean(pendingCode),
    devCode:
      pendingCode && (!smsConfigured || isDevelopment) ? pendingCode : null,
    smsConfigured,
    isDevelopment,
  };
}

function buildDeliveryPayload(
  code: string,
  phone: string | null | undefined,
  smsProvider: string
) {
  const smsConfigured = smsProvider !== "log";
  const isDevelopment = isDevEnvironment();
  const smsDelivered = smsConfigured && !isDevelopment;

  return {
    phone,
    sent: smsDelivered,
    devCode: !smsDelivered ? code : null,
    smsConfigured,
    isDevelopment,
    deliveryHint: !smsDelivered
      ? isDevelopment
        ? "Use the verification code shown below."
        : "SMS is not configured on the server. Use the code shown below."
      : "Check your phone for the verification SMS.",
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

  return apiResponse(
    buildDeliveryPayload(result.code, result.phone, result.smsProvider)
  );
});
