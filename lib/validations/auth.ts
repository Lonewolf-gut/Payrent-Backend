import { z } from "zod";
import { calculateAge, parseDateOfBirth } from "@/lib/utils/age";

const normalizedEmail = z
  .string()
  .min(1, "Please enter your email address")
  .email("Please enter a valid email address")
  .transform((value) => value.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(9, "Password must be more than 8 characters")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[a-z]/, "Password must include at least one lowercase letter")
  .regex(/[0-9]/, "Password must include at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must include at least one special character (e.g. !@#$%)"
  );

export const registerSchema = z.object({
  email: normalizedEmail,
  password: passwordSchema,
  fullName: z.string().min(2, "Please enter your full name"),
  phone: z.preprocess(
    (value) => (typeof value === "string" && !value.trim() ? undefined : value),
    z.string().min(10, "Please enter a valid phone number").optional()
  ),
  role: z.enum(["BUYER", "MERCHANT", "MARKETER", "LENDER"]),
  entityType: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
  companyName: z.string().min(2).optional(),
  dateOfBirth: z.string().optional(),
  dataProcessingConsent: z.coerce
    .boolean()
    .refine((value) => value === true, {
      message: "You must consent to data collection and processing to register.",
    }),
  termsAccepted: z.coerce.boolean().refine((value) => value === true, {
    message: "You must accept the terms of service to register.",
  }),
}).superRefine((data, ctx) => {
  if (data.entityType === "COMPANY" && !data.companyName?.trim()) {
    ctx.addIssue({
      code: "custom",
      message: "Company name is required for business accounts.",
      path: ["companyName"],
    });
  }

  const requiresDateOfBirth = data.entityType !== "COMPANY";
  if (!requiresDateOfBirth) return;

  if (!data.dateOfBirth?.trim()) {
    ctx.addIssue({
      code: "custom",
      message: "Please enter your date of birth.",
      path: ["dateOfBirth"],
    });
    return;
  }

  const parsed = parseDateOfBirth(data.dateOfBirth);
  if (!parsed) {
    ctx.addIssue({
      code: "custom",
      message: "Please enter a valid date of birth.",
      path: ["dateOfBirth"],
    });
    return;
  }

  if (parsed > new Date()) {
    ctx.addIssue({
      code: "custom",
      message: "Date of birth cannot be in the future.",
      path: ["dateOfBirth"],
    });
    return;
  }

  if (calculateAge(parsed) < 18) {
    ctx.addIssue({
      code: "custom",
      message: "You must be at least 18 years old to create an account.",
      path: ["dateOfBirth"],
    });
  }
});

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1, "Please enter your password"),
  otp: z.string().length(6, "Authentication code must be 6 digits").optional(),
});

export const otpSchema = z.object({
  code: z.string().length(6, "OTP must be 6 digits"),
  purpose: z.enum([
    "EMAIL_VERIFY",
    "PHONE_VERIFY",
    "WITHDRAWAL",
    "TRANSFER",
    "2FA",
  ]),
});

export const pinSchema = z.object({
  pin: z.string().length(4).regex(/^\d+$/, "PIN must be 4 digits"),
});

export const resetPasswordSchema = z.object({
  email: normalizedEmail,
  code: z.string().length(6, "Reset code must be 6 digits"),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export function firstZodIssueMessage(error: z.ZodError, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}
