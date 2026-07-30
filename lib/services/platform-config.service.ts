import { isHubtelPaymentsConfigured } from "@/lib/integrations/hubtel/config";
import { isPaystackConfigured } from "@/lib/integrations/paystack/config";
import { getPaymentProvider } from "@/lib/services/payment/provider";

export function getPlatformConfig() {
  return {
    name: process.env.PLATFORM_NAME ?? "PayForMe",
    currency: "GHS",
    environment: process.env.NODE_ENV ?? "development",
    fees: {
      serviceFeePercent: parseFloat(process.env.SERVICE_FEE_PERCENT ?? "1.5"),
      commissionFeePercent: parseFloat(process.env.COMMISSION_FEE_PERCENT ?? "2.0"),
      processingFeePercent: parseFloat(process.env.PROCESSING_FEE_PERCENT ?? "0.5"),
    },
    integrations: {
      payments: {
        provider: getPaymentProvider(),
        hubtelConfigured: isHubtelPaymentsConfigured(),
        paystackConfigured: isPaystackConfigured(),
        configured: isPaystackConfigured() || isHubtelPaymentsConfigured(),
      },
      kyc: {
        provider: process.env.KYC_PROVIDER ?? "manual",
        dojahConfigured: Boolean(process.env.DOJAH_APP_ID && process.env.DOJAH_SECRET_KEY),
      },
      sms: {
        provider: process.env.SMS_PROVIDER ?? "log",
      },
      email: {
        provider:
          process.env.NODE_ENV === "production"
            ? "smtp"
            : process.env.RESEND_API_KEY
              ? "resend"
              : "smtp",
        configured:
          Boolean(process.env.RESEND_API_KEY) ||
          Boolean(process.env.SMTP_HOST && process.env.SMTP_PASSWORD),
      },
      bankMandates: {
        configured: Boolean(process.env.BANK_API_KEY && process.env.BANK_API_URL),
      },
    },
  };
}
