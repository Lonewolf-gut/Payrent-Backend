import { z } from "zod";

export const financingRequestSchema = z.object({
  propertyId: z.string().cuid(),
  applicationId: z.string().cuid().optional(),
  requestedAmount: z.number().positive(),
  durationMonths: z.number().int().min(3).max(60),
  notes: z.string().max(500).optional(),
  monthlyIncome: z.number().positive().optional(),
  repaymentPreference: z
    .object({
      preferredPaymentDay: z.number().int().min(1).max(28).optional(),
      preferredChannel: z.enum(["BANK_MANDATE", "WALLET", "MOBILE_MONEY"]).optional(),
      contactPhone: z.string().max(20).optional(),
      contactEmail: z.string().email().optional(),
      bankAccountId: z.string().cuid().optional(),
      mandateDebitConsent: z.boolean().optional(),
    })
    .optional(),
  dataProcessingConsent: z.literal(true, {
    error: "You must consent to data collection and processing for financing.",
  }),
});

export const approveFinancingSchema = z.object({
  financingRequestId: z.string().cuid(),
  amount: z.number().positive(),
  interestRate: z.number().min(0).max(30),
  planType: z.enum(["MONTHLY", "DEFERRED", "CUSTOM"]),
  customSchedule: z
    .array(
      z.object({
        amount: z.number().positive(),
        dueDate: z.string().datetime(),
      })
    )
    .optional(),
});

export type FinancingRequestInput = z.infer<typeof financingRequestSchema>;
export type ApproveFinancingInput = z.infer<typeof approveFinancingSchema>;
