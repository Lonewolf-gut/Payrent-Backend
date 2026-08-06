import nodemailer from "nodemailer";
import { Resend } from "resend";
import { logger } from "@/lib/logger";

export type EmailProvider = "resend" | "smtp" | "ethereal" | "log";

export type EmailSendResult = {
  queued: boolean;
  mode: EmailProvider;
  messageId?: string;
  previewUrl?: string;
  error?: string;
};

let smtpTransporter: nodemailer.Transporter | null = null;
let etherealTransporterPromise: Promise<nodemailer.Transporter> | null = null;
let resendClient: Resend | null = null;

export function isResendConfigured() {
  const key = process.env.RESEND_API_KEY?.trim();
  return Boolean(key && key !== "re_your_resend_api_key");
}

export function isSmtpConfigured() {
  const host = process.env.SMTP_HOST?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  const user = process.env.SMTP_USER?.trim();
  if (!host || !password || !user) return false;
  if (host === "smtp.example.com") return false;
  return true;
}

/** @deprecated Mailtrap removed — kept for API compatibility */
export function isMailtrapSandbox() {
  return false;
}

/** @deprecated Mailtrap removed — kept for API compatibility */
export function isMailtrapLive() {
  return false;
}

export function isRealEmailConfigured() {
  return isResendConfigured() || isSmtpConfigured();
}

/** Alias used by verification routes */
export function isEmailDeliveryConfigured() {
  return isRealEmailConfigured();
}

export function getEmailFromAddress() {
  return process.env.SMTP_FROM ?? process.env.RESEND_FROM ?? "PayForMe <onboarding@resend.dev>";
}

function resolveEmailProvider(): EmailProvider {
  const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === "log") return "log";
  if (explicit === "resend" && isResendConfigured()) return "resend";
  if (explicit === "smtp" && isSmtpConfigured()) return "smtp";

  if (process.env.NODE_ENV === "production") {
    if (isSmtpConfigured()) return "smtp";
    if (isResendConfigured()) return "resend";
    return "log";
  }

  if (process.env.SMTP_MODE === "log") return "log";
  if (isResendConfigured()) return "resend";
  if (isSmtpConfigured()) return "smtp";
  if (process.env.SMTP_MODE === "ethereal") return "ethereal";
  return "log";
}

function getResendClient() {
  if (!resendClient && isResendConfigured()) {
    resendClient = new Resend(process.env.RESEND_API_KEY!.trim());
  }
  return resendClient;
}

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  if (!isSmtpConfigured()) return null;

  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_PORT === "465",
    requireTLS: process.env.SMTP_PORT !== "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });

  return smtpTransporter;
}

async function getEtherealTransporter() {
  if (!etherealTransporterPromise) {
    etherealTransporterPromise = (async () => {
      const testAccount = await nodemailer.createTestAccount();
      logger.info("Using Ethereal test SMTP for development emails", {
        user: testAccount.user,
        hint: "Set RESEND_API_KEY or SMTP credentials in .env to send real email instead.",
      });
      return nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    })();
  }

  return etherealTransporterPromise;
}

function logDevEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const text = params.text ?? params.html.replace(/<[^>]+>/g, "");
  logger.info("Email (dev log mode — not sent)", {
    to: params.to,
    subject: params.subject,
    body: text,
  });
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailSendResult> {
  const client = getResendClient();
  if (!client) {
    throw new Error("Resend is not configured");
  }

  const from = getEmailFromAddress();
  const { data, error } = await client.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text ?? params.html.replace(/<[^>]+>/g, ""),
  });

  if (error) {
    throw new Error(error.message);
  }

  logger.info("Email sent via Resend", {
    messageId: data?.id,
    to: params.to,
  });

  return {
    queued: true,
    mode: "resend",
    messageId: data?.id,
  };
}

async function sendViaSmtp(
  params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  },
  mode: "smtp" | "ethereal"
): Promise<EmailSendResult> {
  const transport =
    mode === "ethereal" ? await getEtherealTransporter() : getSmtpTransporter();
  if (!transport) {
    throw new Error("SMTP is not configured");
  }

  const from = getEmailFromAddress();
  const info = await transport.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text ?? params.html.replace(/<[^>]+>/g, ""),
  });

  const previewUrl =
    mode === "ethereal" ? nodemailer.getTestMessageUrl(info) || undefined : undefined;

  logger.info("Email sent via SMTP", {
    mode,
    messageId: info.messageId,
    to: params.to,
    previewUrl,
  });

  return {
    queued: true,
    mode,
    messageId: info.messageId,
    previewUrl,
  };
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailSendResult> {
  const provider = resolveEmailProvider();

  if (provider === "log") {
    logDevEmail(params);
    return { queued: true, mode: "log" };
  }

  try {
    if (provider === "resend") {
      return await sendViaResend(params);
    }

    return await sendViaSmtp(params, provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Email delivery failed", { to: params.to, provider, error: message });

    if (process.env.NODE_ENV === "development") {
      if (provider === "resend" && isSmtpConfigured()) {
        try {
          return await sendViaSmtp(params, "smtp");
        } catch {
          // fall through
        }
      }

      if (provider === "smtp" && process.env.SMTP_MODE !== "log") {
        try {
          return await sendViaSmtp(params, "ethereal");
        } catch {
          // fall through
        }
      }

      logDevEmail(params);
      return { queued: true, mode: "log", error: message };
    }

    throw error;
  }
}

export function buildEmailTemplate(title: string, body: string) {
  const htmlBody = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("<br/>");

  return `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;background:#f6f6f6;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <h2 style="color:#059669;margin:0 0 16px">PayForMe</h2>
    <h3 style="margin:0 0 12px">${title}</h3>
    <p style="color:#52525b;line-height:1.6">${htmlBody}</p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0"/>
    <p style="font-size:12px;color:#a1a1aa">© PayForMe — Rental Financing Platform</p>
  </div>
</body>
</html>`;
}
