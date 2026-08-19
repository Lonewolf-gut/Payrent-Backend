import { z } from "zod";
import {
  ID_DOCUMENT_FORMATS,
  SSNIT_NUMBER_FORMAT,
  type IdentityDocumentType,
} from "@/lib/constants/identity-document-formats";

export const entityTypeSchema = z.enum(["INDIVIDUAL", "COMPANY"]);

export const employmentStatusSchema = z.enum([
  "EMPLOYED",
  "SELF_EMPLOYED",
  "UNEMPLOYED",
  "STUDENT",
  "RETIRED",
]);

function emptyToUndefined(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

const optionalText = (min: number) =>
  z.preprocess(emptyToUndefined, z.string().min(min).optional());

const optionalIncome = z.preprocess((value) => {
  const normalized = emptyToUndefined(value);
  if (normalized === undefined) return undefined;
  const amount = typeof normalized === "number" ? normalized : Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return amount;
}, z.number().positive().optional());

export const profileSchema = z
  .object({
    entityType: z.preprocess(emptyToUndefined, entityTypeSchema.optional()),
    dateOfBirth: z.preprocess(emptyToUndefined, z.string().optional()),
    occupation: optionalText(2),
    employerName: optionalText(2),
    monthlyIncome: optionalIncome,
    residentialAddress: optionalText(5),
    staffId: optionalText(2),
    ssnitNumber: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .length(
          SSNIT_NUMBER_FORMAT.exactLength,
          SSNIT_NUMBER_FORMAT.message
        )
        .regex(SSNIT_NUMBER_FORMAT.pattern, SSNIT_NUMBER_FORMAT.message)
        .optional()
    ),
    employmentStatus: z.preprocess(emptyToUndefined, employmentStatusSchema.optional()),
    companyName: optionalText(2),
    companyRegistrationNumber: optionalText(2),
    companyRegisteredAddress: optionalText(5),
    companyTin: optionalText(2),
  })
  .superRefine((data, ctx) => {
    if (data.entityType === "COMPANY") {
      if (!data.companyName) {
        ctx.addIssue({
          code: "custom",
          message: "Company name is required.",
          path: ["companyName"],
        });
      }
      if (!data.companyRegistrationNumber) {
        ctx.addIssue({
          code: "custom",
          message: "Company registration number is required.",
          path: ["companyRegistrationNumber"],
        });
      }
      if (!data.companyRegisteredAddress) {
        ctx.addIssue({
          code: "custom",
          message: "Registered company address is required.",
          path: ["companyRegisteredAddress"],
        });
      }
    } else if (data.entityType === "INDIVIDUAL" && !data.employmentStatus) {
      ctx.addIssue({
        code: "custom",
        message: "Employment status is required for individual accounts.",
        path: ["employmentStatus"],
      });
    }
  });

export const tenantProfileSchema = profileSchema;

export const identityDocumentTypeSchema = z.enum([
  "GHANA_CARD",
  "VOTER_ID",
  "PASSPORT",
  "DRIVERS_LICENSE",
]);

const requiredTrimmedText = (min: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(min, `${label} must be at least ${min} characters.`)
  );

export const identityVerifySchema = z
  .object({
    entityType: entityTypeSchema.default("INDIVIDUAL"),
    documentType: identityDocumentTypeSchema.default("GHANA_CARD"),
    idNumber: requiredTrimmedText(3, "ID number"),
    fullName: requiredTrimmedText(2, "Full name"),
    dateOfBirth: z.preprocess(emptyToUndefined, z.string().optional()),
  })
  .superRefine((data, ctx) => {
    if (data.entityType === "INDIVIDUAL") {
      const rule = ID_DOCUMENT_FORMATS[data.documentType as IdentityDocumentType];
      if (data.idNumber.length !== rule.exactLength) {
        ctx.addIssue({
          code: "custom",
          message: rule.message,
          path: ["idNumber"],
        });
      } else if (!rule.pattern.test(data.idNumber)) {
        ctx.addIssue({
          code: "custom",
          message: rule.message,
          path: ["idNumber"],
        });
      }
      if (data.documentType === "DRIVERS_LICENSE" && !data.dateOfBirth) {
        ctx.addIssue({
          code: "custom",
          message: "Date of birth is required for driver's licence verification.",
          path: ["dateOfBirth"],
        });
      }
    }
  });

export const kybVerifySchema = z.object({
  entityType: z.literal("COMPANY"),
  companyName: z.string().min(2),
  companyRegistrationNumber: z.string().min(2),
  companyRegisteredAddress: z.string().min(5),
  companyTin: optionalText(2),
  fullName: z.string().min(2),
});

export const utilityBillTypeSchema = z.enum([
  "ELECTRICITY",
  "WATER",
  "LANDLINE",
  "INTERNET",
]);

export const employmentVerifySchema = z.object({
  staffId: z.string().min(2, "Staff ID is required."),
  ssnitNumber: z
    .string()
    .trim()
    .length(SSNIT_NUMBER_FORMAT.exactLength, SSNIT_NUMBER_FORMAT.message)
    .regex(SSNIT_NUMBER_FORMAT.pattern, SSNIT_NUMBER_FORMAT.message),
  employerName: optionalText(2),
  occupation: optionalText(2),
});

export const addressVerifySchema = z
  .object({
    entityType: entityTypeSchema.default("INDIVIDUAL"),
    address: z.string().min(5, "Address is required."),
    billType: utilityBillTypeSchema,
    latitude: z.preprocess(
      (value) => (value === "" || value == null ? undefined : Number(value)),
      z.number().min(-90).max(90).optional()
    ),
    longitude: z.preprocess(
      (value) => (value === "" || value == null ? undefined : Number(value)),
      z.number().min(-180).max(180).optional()
    ),
  })
  .superRefine((data, ctx) => {
    if (data.entityType === "COMPANY" && data.address.trim().length < 5) {
      ctx.addIssue({
        code: "custom",
        message: "Registered business address is required.",
        path: ["address"],
      });
    }
  });

export const ghanaCardVerifySchema = z.object({
  ghanaCardNumber: z
    .string()
    .trim()
    .length(
      ID_DOCUMENT_FORMATS.GHANA_CARD.exactLength,
      ID_DOCUMENT_FORMATS.GHANA_CARD.message
    )
    .regex(ID_DOCUMENT_FORMATS.GHANA_CARD.pattern, ID_DOCUMENT_FORMATS.GHANA_CARD.message),
  fullName: z.string().min(2),
  dateOfBirth: z.preprocess(emptyToUndefined, z.string().optional()),
  documentType: identityDocumentTypeSchema.optional(),
});

export const bankAccountSchema = z.object({
  accountType: z.enum(["BANK", "MOMO"]).default("BANK"),
  bankCode: z.preprocess(emptyToUndefined, z.string().optional()),
  bankName: z.string().min(2),
  accountNumber: z.string().min(8),
  accountName: z.string().min(2),
  isDefault: z.boolean().default(false),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type TenantProfileInput = ProfileInput;
export type IdentityVerifyInput = z.infer<typeof identityVerifySchema>;
export type KybVerifyInput = z.infer<typeof kybVerifySchema>;
export type EmploymentVerifyInput = z.infer<typeof employmentVerifySchema>;
export type AddressVerifyInput = z.infer<typeof addressVerifySchema>;
export type UtilityBillType = z.infer<typeof utilityBillTypeSchema>;
export type GhanaCardVerifyInput = z.infer<typeof ghanaCardVerifySchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

export function firstProfileIssueMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Validation failed.";
}

export function toIdentityVerifyInput(
  input: GhanaCardVerifyInput
): IdentityVerifyInput {
  return {
    entityType: "INDIVIDUAL",
    documentType: input.documentType ?? "GHANA_CARD",
    idNumber: input.ghanaCardNumber,
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth,
  };
}
