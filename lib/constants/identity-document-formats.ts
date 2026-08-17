export type IdentityDocumentType =
  | "GHANA_CARD"
  | "VOTER_ID"
  | "PASSPORT"
  | "DRIVERS_LICENSE";

type DocumentFormatRule = {
  exactLength: number;
  pattern: RegExp;
  message: string;
  placeholder: string;
};

export const ID_DOCUMENT_FORMATS: Record<IdentityDocumentType, DocumentFormatRule> = {
  GHANA_CARD: {
    exactLength: 15,
    pattern: /^GHA-\d{9}-\d$/,
    message: "Ghana Card number must be exactly 15 characters (GHA-XXXXXXXXX-X).",
    placeholder: "GHA-123456789-1",
  },
  VOTER_ID: {
    exactLength: 10,
    pattern: /^\d{10}$/,
    message: "Voter ID must be exactly 10 digits.",
    placeholder: "1234567890",
  },
  PASSPORT: {
    exactLength: 8,
    pattern: /^[A-Z]\d{7}$/i,
    message: "Passport number must be exactly 8 characters (1 letter + 7 digits).",
    placeholder: "G1234567",
  },
  DRIVERS_LICENSE: {
    exactLength: 8,
    pattern: /^[A-Z]\d{7}$/i,
    message: "Driver's licence number must be exactly 8 characters (1 letter + 7 digits).",
    placeholder: "V1234567",
  },
};

export const SSNIT_NUMBER_FORMAT = {
  exactLength: 13,
  pattern: /^[A-Za-z]\d{12}$/,
  message: "SSNIT number must be exactly 13 characters (1 letter followed by 12 digits).",
  placeholder: "C123456789012",
} as const;

export function validateIdentityDocumentNumber(
  documentType: IdentityDocumentType,
  value: string
): string | null {
  const trimmed = value.trim();
  const rule = ID_DOCUMENT_FORMATS[documentType];

  if (!trimmed) return "Enter your ID number before submitting.";
  if (trimmed.length !== rule.exactLength) {
    return `${rule.message} You entered ${trimmed.length} character${trimmed.length === 1 ? "" : "s"}.`;
  }
  if (!rule.pattern.test(trimmed)) return rule.message;
  return null;
}

export function validateSsnitNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "SSNIT number is required for employed users.";
  if (trimmed.length !== SSNIT_NUMBER_FORMAT.exactLength) {
    return `${SSNIT_NUMBER_FORMAT.message} You entered ${trimmed.length} character${trimmed.length === 1 ? "" : "s"}.`;
  }
  if (!SSNIT_NUMBER_FORMAT.pattern.test(trimmed)) return SSNIT_NUMBER_FORMAT.message;
  return null;
}
