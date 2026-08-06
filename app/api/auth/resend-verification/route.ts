import { prisma } from "@/lib/db/prisma";
import { otpService } from "@/lib/services/otp.service";
import { notificationService } from "@/lib/services/notification.service";
import {
  isEmailDeliveryConfigured,
  isMailtrapSandbox,
  isSmtpConfigured,
} from "@/lib/services/email.service";
import { apiResponse, withAuth } from "@/lib/api/handler";

type VerificationDelivery = {
  sent: boolean;
  deliveryMode: "smtp" | "ethereal" | "log" | null;
  previewUrl: string | null;
  devCode: string | null;
  realEmailExpected: boolean;
  mailtrapSandbox: boolean;
};

function buildDeliveryPayload(
  code: string,
  emailResult: Awaited<ReturnType<typeof notificationService.deliverEmail>>
): VerificationDelivery {
  const deliveryMode = emailResult?.mode ?? "log";
  const emailConfigured = isEmailDeliveryConfigured();
  const smtpOk = deliveryMode === "smtp" && isSmtpConfigured();
  const isDevelopment = process.env.NODE_ENV === "development";

  return {
    sent: true,
    deliveryMode,
    previewUrl: emailResult?.previewUrl ?? null,
    devCode: isDevelopment && !emailConfigured ? code : null,
    realEmailExpected: emailConfigured,
    mailtrapSandbox: isMailtrapSandbox(),
  };
}

function buildStatusPayload(pendingCode: string | null) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const emailConfigured = isEmailDeliveryConfigured();

  return {
    hasPendingCode: Boolean(pendingCode),
    devCode: isDevelopment && pendingCode && !emailConfigured ? pendingCode : null,
    realEmailExpected: emailConfigured,
    mailtrapSandbox: isMailtrapSandbox(),
    isDevelopment,
  };
}

export const GET = withAuth(async (_req, _ctx, session) => {
  const pending = await prisma.otpCode.findFirst({
    where: {
      userId: session.user.id,
      purpose: "EMAIL_VERIFY",
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });

  return apiResponse(buildStatusPayload(pending?.code ?? null));
});

export const POST = withAuth(async (_req, _ctx, session) => {
  const code = await otpService.create(session.user.id, "EMAIL_VERIFY", 15);

  const emailResult = await notificationService.deliverEmail(
    session.user.id,
    "Verify your email",
    `Your verification code is: ${code}\n\nIt expires in 15 minutes. Enter this code on the verify email page to unlock your dashboard.`
  );

  await notificationService.create({
    userId: session.user.id,
    title: "Verify your email",
    body: `Your verification code is: ${code}. It expires in 15 minutes.`,
    channel: "IN_APP",
    sendEmail: false,
  });

  return apiResponse(buildDeliveryPayload(code, emailResult));
});
