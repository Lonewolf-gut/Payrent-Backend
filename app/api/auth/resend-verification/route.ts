import { prisma } from "@/lib/db/prisma";
import { otpService } from "@/lib/services/otp.service";
import { notificationService } from "@/lib/services/notification.service";
import {
  isEmailDeliveryConfigured,
  isMailtrapSandbox,
  type EmailSendResult,
} from "@/lib/services/email.service";
import { shouldExposeOtpCodes } from "@/lib/auth/expose-otp";
import { apiResponse, withAuth } from "@/lib/api/handler";

function resolveEmailDevCode(code: string | null | undefined) {
  if (!code) return null;
  if (shouldExposeOtpCodes()) return code;
  if (!isEmailDeliveryConfigured()) return code;
  return null;
}

type VerificationDelivery = {
  sent: boolean;
  deliveryMode: "smtp" | "ethereal" | "log" | "resend" | null;
  previewUrl: string | null;
  devCode: string | null;
  realEmailExpected: boolean;
  mailtrapSandbox: boolean;
  emailError: string | null;
  deliveryHint: string | null;
};

function wasEmailDelivered(emailResult: EmailSendResult | null | undefined) {
  if (!emailResult) return false;
  if (emailResult.error) return false;
  return emailResult.mode !== "log";
}

function buildDeliveryHint(params: {
  delivered: boolean;
  emailConfigured: boolean;
  emailError: string | null;
  isDevelopment: boolean;
}) {
  if (params.delivered) {
    return "Check your inbox and spam folder for the verification email.";
  }

  if (params.emailError) {
    return `Email could not be sent: ${params.emailError}`;
  }

  if (!params.emailConfigured) {
    return params.isDevelopment
      ? "Email is not configured on the server. Use the code shown below."
      : "Email delivery is not configured. Contact support for help verifying your account.";
  }

  return "We could not confirm email delivery. Use the code below or try resend again.";
}

function buildDeliveryPayload(
  code: string,
  emailResult: Awaited<ReturnType<typeof notificationService.deliverEmail>>
): VerificationDelivery {
  const delivered = wasEmailDelivered(emailResult);
  const emailConfigured = isEmailDeliveryConfigured();
  const isDevelopment = shouldExposeOtpCodes();
  const emailError = emailResult?.error ?? null;
  const devCode = resolveEmailDevCode(code);

  return {
    sent: delivered,
    deliveryMode: emailResult?.mode ?? "log",
    previewUrl: emailResult?.previewUrl ?? null,
    devCode,
    realEmailExpected: emailConfigured && delivered && !isDevelopment,
    mailtrapSandbox: isMailtrapSandbox(),
    emailError,
    deliveryHint: buildDeliveryHint({
      delivered,
      emailConfigured,
      emailError,
      isDevelopment,
    }),
  };
}

function buildStatusPayload(pendingCode: string | null) {
  const isDevelopment = shouldExposeOtpCodes();
  const emailConfigured = isEmailDeliveryConfigured();

  return {
    hasPendingCode: Boolean(pendingCode),
    devCode: resolveEmailDevCode(pendingCode),
    realEmailExpected: emailConfigured && !isDevelopment,
    mailtrapSandbox: isMailtrapSandbox(),
    isDevelopment,
    sent: false,
    deliveryMode: null,
    previewUrl: null,
    emailError: null,
    deliveryHint: pendingCode
      ? emailConfigured
        ? "A verification code is already active. Resend if you did not receive the email."
        : isDevelopment
          ? "Use the verification code shown below."
          : null
      : null,
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
