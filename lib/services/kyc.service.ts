import { NextRequest } from "next/server";
import type {
  BankAccount,
  EntityType,
  KycDocument,
  KycDocumentType,
  Prisma,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  notifyAllAdminsInAppAndEmail,
  notifyUserInAppAndEmail,
} from "@/lib/services/verification-notifications";
import { auditService } from "@/lib/services/audit.service";
import { AppError } from "@/lib/errors";
import { saveKycDocument } from "@/lib/integrations/documents";
import {
  assertAllowedPayoutBank,
  getAllowedPayoutBankProviders,
} from "@/lib/constants/allowed-payout-banks";
import type {
  ProfileInput,
  IdentityVerifyInput,
  KybVerifyInput,
  EmploymentVerifyInput,
  AddressVerifyInput,
  BankAccountInput,
  GhanaCardVerifyInput,
} from "@/lib/validations/kyc";
import { toIdentityVerifyInput } from "@/lib/validations/kyc";
import { getProfileDisplayName } from "@/lib/utils/display-name";
import {
  getActiveKycProviderName,
  getKycProvider,
  toClientVerificationStatus,
  type BankValidationOutcome,
  type IdentityVerificationResult,
} from "@/lib/integrations/kyc";
import { validateBankAccountWithPaystack } from "@/lib/integrations/kyc/paystack-bank-validation";
import { isPaystackConfigured } from "@/lib/integrations/paystack/config";
import { withProfileImageVersion } from "@/lib/utils/profile-image";
import {
  isEmploymentRecorded,
  requiresEmploymentDocuments,
} from "@/lib/constants/employment-status";
import { getUserDisplayName as resolveUserDisplayName } from "@/lib/services/verification-notifications";

function maskAccountNumber(accountNumber: string) {
  if (accountNumber.length <= 4) return accountNumber;
  return `${"*".repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`;
}

type ProfileCompletionShape = {
  employmentStatus?: string | null;
  residentialAddress?: string | null;
  officeAddress?: string | null;
  occupation?: string | null;
  employerName?: string | null;
  institutionName?: string | null;
  lenderType?: string | null;
  staffId?: string | null;
  ssnitNumber?: string | null;
  companyName?: string | null;
  companyRegistrationNumber?: string | null;
  companyRegisteredAddress?: string | null;
};

function isCompanyProfileComplete(profile: ProfileCompletionShape) {
  return Boolean(
    profile.companyName?.trim() &&
      profile.companyRegistrationNumber?.trim() &&
      profile.companyRegisteredAddress?.trim()
  );
}

function isIndividualProfileComplete(role: UserRole, profile: ProfileCompletionShape) {
  if (!profile.employmentStatus) return false;

  const address =
    role === "MARKETER" ? profile.officeAddress : profile.residentialAddress;
  if (!address?.trim()) return false;

  if (role === "LENDER") {
    if (!profile.institutionName?.trim() || !profile.lenderType?.trim()) {
      return false;
    }
  }

  if (requiresEmploymentDocuments(profile.employmentStatus)) {
    if (!profile.staffId?.trim() || !profile.ssnitNumber?.trim()) {
      return false;
    }
  }

  return true;
}

function resolveProfileStatus(
  role: UserRole,
  entityType: EntityType,
  profile: ProfileCompletionShape
) {
  const complete =
    entityType === "COMPANY"
      ? isCompanyProfileComplete(profile)
      : isIndividualProfileComplete(role, profile);
  return complete ? "PROFILE_COMPLETED" : "INCOMPLETE";
}

type VerificationData = {
  entityType?: EntityType;
  documentType?: string;
  ghanaCardNumber?: string;
  idNumber?: string;
  fullName?: string;
  dateOfBirth?: string;
  role?: UserRole;
  companyName?: string;
  companyRegistrationNumber?: string;
  companyRegisteredAddress?: string;
  companyTin?: string;
  staffId?: string;
  employerName?: string;
  occupation?: string;
  address?: string;
  billType?: string;
  employmentStatus?: string;
  requiresManualReview?: boolean;
  bankAccountId?: string;
  bankName?: string;
  accountName?: string;
  documentUrls?: Partial<Record<KycDocumentType, string>>;
  matchDetails?: Record<string, unknown>;
  rawResponseReference?: string;
};

function requiresManualReview(data: VerificationData | null | undefined): boolean {
  if (!data) return true;
  if (data.requiresManualReview === false) return false;
  return true;
}

function toIdentityResult(verification: {
  id: string;
  status: import("@prisma/client").VerificationStatus;
  providerName: string | null;
  providerReference: string | null;
  verifiedAt: Date | null;
  failureReason: string | null;
  data: unknown;
}): IdentityVerificationResult {
  const data = verification.data as VerificationData | null;
  return {
    verificationId: verification.id,
    verificationStatus: toClientVerificationStatus(verification.status),
    providerName: (verification.providerName ??
      getActiveKycProviderName()) as IdentityVerificationResult["providerName"],
    providerReference: verification.providerReference,
    verifiedAt: verification.verifiedAt?.toISOString() ?? null,
    failureReason: verification.failureReason,
    requiresManualReview: requiresManualReview(data),
  };
}

async function notifyUser(userId: string, title: string, body: string) {
  await notifyUserInAppAndEmail(userId, title, body);
}

async function notifyAdmins(
  title: string,
  body: string,
  metadata?: Record<string, unknown>
) {
  await notifyAllAdminsInAppAndEmail(title, body, metadata);
}

async function getUserContactLines(userId: string) {
  const [user, displayName] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, role: true },
    }),
    resolveUserDisplayName(userId),
  ]);

  const lines = [
    displayName ? `Name: ${displayName}` : null,
    user?.email ? `Email: ${user.email}` : null,
    user?.phone ? `Phone: ${user.phone}` : null,
    user?.role ? `Role: ${user.role}` : null,
  ].filter(Boolean);

  return {
    displayName: displayName ?? user?.email ?? "User",
    email: user?.email ?? null,
    phone: user?.phone ?? null,
    role: user?.role ?? null,
    summary: lines.join(" · "),
  };
}

async function saveVerificationDocuments(
  userId: string,
  verificationId: string,
  files: Partial<Record<KycDocumentType, File>>
) {
  const entries = Object.entries(files).filter(
    (entry): entry is [KycDocumentType, File] => entry[1] instanceof File
  );

  const saved = await Promise.all(
    entries.map(async ([documentType, file]) => {
      const fileUrl = await saveKycDocument(file, userId);
      return prisma.kycDocument.create({
        data: {
          userId,
          verificationId,
          documentType,
          fileName: file.name,
          fileUrl,
        },
      });
    })
  );

  return Object.fromEntries(
    saved.map((doc: KycDocument) => [doc.documentType, doc.fileUrl])
  ) as Partial<Record<KycDocumentType, string>>;
}

export class KycService {
  getProviderName() {
    return getActiveKycProviderName();
  }

  async updateProfile(userId: string, role: UserRole, input: ProfileInput) {
    const entityType = input.entityType ?? "INDIVIDUAL";
    const companyData =
      entityType === "COMPANY"
        ? {
            entityType,
            companyName: input.companyName,
            companyRegistrationNumber: input.companyRegistrationNumber,
            companyRegisteredAddress: input.companyRegisteredAddress,
            companyTin: input.companyTin,
            employmentStatus: null,
            employmentVerified: false,
          }
        : { entityType };

    const employmentData =
      entityType === "INDIVIDUAL" && input.employmentStatus
        ? {
            employmentStatus: input.employmentStatus,
            employmentVerified: requiresEmploymentDocuments(input.employmentStatus)
              ? false
              : true,
          }
        : {};

    if (role === "BUYER") {
      const existing = await prisma.tenant.findUnique({ where: { userId } });
      if (!existing) throw new AppError("Customer profile not found", 404);

      const mergedProfile: ProfileCompletionShape = {
        employmentStatus: input.employmentStatus ?? existing.employmentStatus,
        residentialAddress: input.residentialAddress ?? existing.residentialAddress,
        occupation: input.occupation ?? existing.occupation,
        employerName: input.employerName ?? existing.employerName,
        staffId: input.staffId ?? existing.staffId,
        ssnitNumber: input.ssnitNumber ?? existing.ssnitNumber,
        companyName: input.companyName ?? existing.companyName,
        companyRegistrationNumber:
          input.companyRegistrationNumber ?? existing.companyRegistrationNumber,
        companyRegisteredAddress:
          input.companyRegisteredAddress ?? existing.companyRegisteredAddress,
      };

      const updated = await prisma.tenant.update({
        where: { userId },
        data: {
          profileStatus: resolveProfileStatus(role, entityType, mergedProfile),
          ...companyData,
          ...employmentData,
          ...(input.dateOfBirth ? { dateOfBirth: new Date(input.dateOfBirth) } : {}),
          occupation: input.occupation ?? existing.occupation,
          employerName: input.employerName ?? existing.employerName,
          staffId: input.staffId ?? existing.staffId,
          ssnitNumber: input.ssnitNumber ?? existing.ssnitNumber,
          monthlyIncome: input.monthlyIncome ?? existing.monthlyIncome,
          residentialAddress: input.residentialAddress ?? existing.residentialAddress,
        },
      });
      await auditService.log({
        userId,
        action: "TENANT_PROFILE_UPDATED",
        entity: "Tenant",
        entityId: updated.id,
      });
      return updated;
    }

    if (role === "MERCHANT") {
      const existing = await prisma.landlord.findUnique({ where: { userId } });
      if (!existing) throw new AppError("Merchant profile not found", 404);

      const mergedProfile: ProfileCompletionShape = {
        employmentStatus: input.employmentStatus ?? existing.employmentStatus,
        residentialAddress: input.residentialAddress ?? existing.residentialAddress,
        occupation: input.occupation ?? existing.occupation,
        employerName: input.employerName ?? existing.employerName,
        staffId: input.staffId ?? existing.staffId,
        ssnitNumber: input.ssnitNumber ?? existing.ssnitNumber,
        companyName: input.companyName ?? existing.companyName,
        companyRegistrationNumber:
          input.companyRegistrationNumber ?? existing.companyRegistrationNumber,
        companyRegisteredAddress:
          input.companyRegisteredAddress ?? existing.companyRegisteredAddress,
      };

      const updated = await prisma.landlord.update({
        where: { userId },
        data: {
          profileStatus: resolveProfileStatus(role, entityType, mergedProfile),
          ...companyData,
          ...employmentData,
          ...(input.dateOfBirth ? { dateOfBirth: new Date(input.dateOfBirth) } : {}),
          occupation: input.occupation ?? existing.occupation,
          employerName: input.employerName ?? existing.employerName,
          staffId: input.staffId ?? existing.staffId,
          ssnitNumber: input.ssnitNumber ?? existing.ssnitNumber,
          monthlyIncome: input.monthlyIncome ?? existing.monthlyIncome,
          residentialAddress: input.residentialAddress ?? existing.residentialAddress,
        },
      });
      await auditService.log({
        userId,
        action: "LANDLORD_PROFILE_UPDATED",
        entity: "Landlord",
        entityId: updated.id,
      });
      return updated;
    }

    if (role === "LENDER") {
      const existing = await prisma.lender.findUnique({ where: { userId } });
      if (!existing) throw new AppError("Lender profile not found", 404);

      const mergedProfile: ProfileCompletionShape = {
        employmentStatus: input.employmentStatus ?? existing.employmentStatus,
        residentialAddress: input.residentialAddress ?? existing.residentialAddress,
        institutionName: input.employerName ?? existing.institutionName,
        lenderType: input.occupation ?? existing.lenderType,
        staffId: input.staffId ?? existing.staffId,
        ssnitNumber: input.ssnitNumber ?? existing.ssnitNumber,
      };

      const updated = await prisma.lender.update({
        where: { userId },
        data: {
          profileStatus: resolveProfileStatus(role, entityType, mergedProfile),
          ...employmentData,
          ...(input.dateOfBirth ? { dateOfBirth: new Date(input.dateOfBirth) } : {}),
          institutionName: input.employerName ?? existing.institutionName,
          lenderType: input.occupation ?? existing.lenderType,
          staffId: input.staffId ?? existing.staffId,
          ssnitNumber: input.ssnitNumber ?? existing.ssnitNumber,
          residentialAddress: input.residentialAddress ?? existing.residentialAddress,
        },
      });
      await auditService.log({
        userId,
        action: "LENDER_PROFILE_UPDATED",
        entity: "Lender",
        entityId: updated.id,
      });
      return updated;
    }

    if (role === "MARKETER") {
      const existing = await prisma.agentProfile.findUnique({ where: { userId } });
      if (!existing) throw new AppError("Affiliate profile not found", 404);

      const mergedProfile: ProfileCompletionShape = {
        employmentStatus: input.employmentStatus ?? existing.employmentStatus,
        officeAddress: input.residentialAddress ?? existing.officeAddress,
        staffId: input.staffId ?? existing.staffId,
        ssnitNumber: input.ssnitNumber ?? existing.ssnitNumber,
      };

      const updated = await prisma.agentProfile.update({
        where: { userId },
        data: {
          profileStatus: resolveProfileStatus(role, entityType, mergedProfile),
          ...employmentData,
          ...(input.dateOfBirth ? { dateOfBirth: new Date(input.dateOfBirth) } : {}),
          officeAddress: input.residentialAddress ?? existing.officeAddress,
          staffId: input.staffId ?? existing.staffId,
          ssnitNumber: input.ssnitNumber ?? existing.ssnitNumber,
        },
      });
      await auditService.log({
        userId,
        action: "AGENT_PROFILE_UPDATED",
        entity: "AgentProfile",
        entityId: updated.id,
      });
      return updated;
    }

    throw new AppError("Unsupported role for profile update");
  }

  async submitManualIdentity(
    userId: string,
    role: UserRole,
    input: IdentityVerifyInput,
    files: {
      idFront: File;
      idBack: File;
      facePhoto: File;
    }
  ) {
    const currentStatus = await this.getVerificationStatus(userId, role);
    if (currentStatus.identityVerified) {
      throw new AppError("Identity is already verified");
    }

    const existingPending = await prisma.verification.findFirst({
      where: {
        userId,
        type: { in: ["IDENTITY", "KYB"] },
        status: "PENDING",
      },
    });
    if (existingPending) {
      throw new AppError("Verification already pending review");
    }

    const profileSnapshot = await this.getProfileSnapshot(userId, role);
    const verificationData: VerificationData = {
      entityType: "INDIVIDUAL",
      documentType: input.documentType,
      idNumber: input.idNumber,
      ghanaCardNumber:
        input.documentType === "GHANA_CARD" ? input.idNumber : undefined,
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      role,
      requiresManualReview: true,
      ...profileSnapshot,
    };

    const verification = await prisma.verification.create({
      data: {
        userId,
        type: "IDENTITY",
        status: "PENDING",
        providerName: "manual",
        data: verificationData,
      },
    });

    const documentUrls = await saveVerificationDocuments(userId, verification.id, {
      ID_FRONT: files.idFront,
      ID_BACK: files.idBack,
      FACE_PHOTO: files.facePhoto,
    });

    await prisma.verification.update({
      where: { id: verification.id },
      data: {
        data: {
          ...verificationData,
          documentUrls,
        },
      },
    });

    await this.setProfilePendingIdentity(userId, role, input.idNumber);

    const contact = await getUserContactLines(userId);
    await notifyUser(
      userId,
      "Identity submitted for review",
      "Your identity documents have been submitted and are pending administrator approval."
    );

    await notifyAdmins(
      "New identity verification submission",
      `${contact.summary} submitted identity documents (${input.documentType.replace(/_/g, " ").toLowerCase()}) for manual review.`,
      { verificationId: verification.id, userId, role, type: "IDENTITY" }
    );

    await auditService.log({
      userId,
      action: "IDENTITY_SUBMITTED",
      entity: "Verification",
      entityId: verification.id,
      metadata: { entityType: "INDIVIDUAL", documentType: input.documentType },
    });

    return toIdentityResult(verification);
  }

  async submitManualKyb(
    userId: string,
    role: UserRole,
    input: KybVerifyInput,
    files: {
      companyRegistration: File;
      companyTin?: File | null;
    }
  ) {
    const currentStatus = await this.getVerificationStatus(userId, role);
    if (currentStatus.identityVerified) {
      throw new AppError("Business verification is already complete");
    }

    const existingPending = await prisma.verification.findFirst({
      where: {
        userId,
        type: { in: ["IDENTITY", "KYB"] },
        status: "PENDING",
      },
    });
    if (existingPending) {
      throw new AppError("Verification already pending review");
    }

    const profileSnapshot = await this.getProfileSnapshot(userId, role);
    const verificationData: VerificationData = {
      entityType: "COMPANY",
      fullName: input.fullName,
      companyName: input.companyName,
      companyRegistrationNumber: input.companyRegistrationNumber,
      companyRegisteredAddress: input.companyRegisteredAddress,
      companyTin: input.companyTin,
      role,
      requiresManualReview: true,
      ...profileSnapshot,
    };

    const verification = await prisma.verification.create({
      data: {
        userId,
        type: "KYB",
        status: "PENDING",
        providerName: "manual",
        data: verificationData,
      },
    });

    const documentUrls = await saveVerificationDocuments(userId, verification.id, {
      COMPANY_REGISTRATION: files.companyRegistration,
      ...(files.companyTin ? { COMPANY_TIN: files.companyTin } : {}),
    });

    await prisma.verification.update({
      where: { id: verification.id },
      data: {
        data: {
          ...verificationData,
          documentUrls,
        },
      },
    });

    if (role === "BUYER") {
      await prisma.tenant.update({
        where: { userId },
        data: {
          entityType: "COMPANY",
          companyName: input.companyName,
          companyRegistrationNumber: input.companyRegistrationNumber,
          companyRegisteredAddress: input.companyRegisteredAddress,
          companyTin: input.companyTin,
          profileStatus: "KYC_PENDING",
        },
      });
    } else if (role === "MERCHANT") {
      await prisma.landlord.update({
        where: { userId },
        data: {
          entityType: "COMPANY",
          companyName: input.companyName,
          companyRegistrationNumber: input.companyRegistrationNumber,
          companyRegisteredAddress: input.companyRegisteredAddress,
          companyTin: input.companyTin,
          profileStatus: "KYC_PENDING",
        },
      });
    }

    const contact = await getUserContactLines(userId);
    await notifyUser(
      userId,
      "Business verification submitted",
      "Your company documents have been submitted and are pending administrator approval."
    );

    await notifyAdmins(
      "New business verification submission",
      `${contact.summary} submitted company registration documents for manual review.`,
      { verificationId: verification.id, userId, role, type: "KYB" }
    );

    await auditService.log({
      userId,
      action: "KYB_SUBMITTED",
      entity: "Verification",
      entityId: verification.id,
      metadata: { companyName: input.companyName },
    });

    return toIdentityResult(verification);
  }

  async submitManualEmployment(
    userId: string,
    role: UserRole,
    input: EmploymentVerifyInput,
    files: {
      employmentLetter: File;
      staffIdDocument: File;
      ssnitDocument: File;
    }
  ) {
    const profile = await this.getRoleProfile(userId, role);
    if (profile?.employmentVerified) {
      throw new AppError("Employment is already verified");
    }
    if (profile?.employmentStatus !== "EMPLOYED") {
      throw new AppError(
        "Employment document verification is only required when your status is Employed."
      );
    }

    const existingPending = await prisma.verification.findFirst({
      where: { userId, type: "EMPLOYMENT", status: "PENDING" },
    });
    if (existingPending) {
      throw new AppError("Employment verification already pending review");
    }

    const verificationData: VerificationData = {
      staffId: input.staffId,
      ssnitNumber: input.ssnitNumber,
      employerName: input.employerName,
      occupation: input.occupation,
      employmentStatus: profile?.employmentStatus ?? "EMPLOYED",
      role,
      requiresManualReview: true,
    };

    const verification = await prisma.verification.create({
      data: {
        userId,
        type: "EMPLOYMENT",
        status: "PENDING",
        providerName: "manual",
        data: verificationData,
      },
    });

    const documentUrls = await saveVerificationDocuments(userId, verification.id, {
      EMPLOYMENT_LETTER: files.employmentLetter,
      STAFF_ID: files.staffIdDocument,
      SSNIT_CARD: files.ssnitDocument,
    });

    await prisma.verification.update({
      where: { id: verification.id },
      data: { data: { ...verificationData, documentUrls } },
    });

    await this.updateRoleProfile(userId, role, {
      staffId: input.staffId,
      ssnitNumber: input.ssnitNumber,
    });

    const contact = await getUserContactLines(userId);
    await notifyUser(
      userId,
      "Employment documents submitted",
      "Your employment letter, staff ID, and SSNIT document have been submitted and are pending administrator review."
    );
    await notifyAdmins(
      "New employment verification submission",
      `${contact.summary} submitted employment documents for manual review.`,
      { verificationId: verification.id, userId, role, type: "EMPLOYMENT" }
    );

    await auditService.log({
      userId,
      action: "EMPLOYMENT_SUBMITTED",
      entity: "Verification",
      entityId: verification.id,
    });

    return toIdentityResult(verification);
  }

  async submitManualAddress(
    userId: string,
    role: UserRole,
    input: AddressVerifyInput,
    files: { addressProof: File }
  ) {
    const profile = await this.getRoleProfile(userId, role);
    if (profile?.addressVerified) {
      throw new AppError("Address is already verified");
    }

    const existingPending = await prisma.verification.findFirst({
      where: { userId, type: "ADDRESS", status: "PENDING" },
    });
    if (existingPending) {
      throw new AppError("Address verification already pending review");
    }

    const profileSnapshot = await this.getProfileSnapshot(userId, role);
    const verificationData: VerificationData = {
      entityType: input.entityType,
      address: input.address,
      billType: input.billType,
      role,
      requiresManualReview: true,
      ...profileSnapshot,
    };

    const verification = await prisma.verification.create({
      data: {
        userId,
        type: "ADDRESS",
        status: "PENDING",
        providerName: "manual",
        data: verificationData,
      },
    });

    const documentUrls = await saveVerificationDocuments(userId, verification.id, {
      ADDRESS_PROOF: files.addressProof,
    });

    await prisma.verification.update({
      where: { id: verification.id },
      data: { data: { ...verificationData, documentUrls } },
    });

    if (input.entityType === "COMPANY") {
      await this.updateRoleProfile(userId, role, {
        companyRegisteredAddress: input.address,
      });
    } else {
      await this.updateRoleProfile(userId, role, {
        residentialAddress: input.address,
      });
    }

    const contact = await getUserContactLines(userId);
    await notifyUser(
      userId,
      "Address documents submitted",
      "Your address proof has been submitted and is pending administrator review."
    );
    await notifyAdmins(
      "New address verification submission",
      `${contact.summary} submitted address proof for manual review.`,
      { verificationId: verification.id, userId, role, type: "ADDRESS" }
    );

    await auditService.log({
      userId,
      action: "ADDRESS_SUBMITTED",
      entity: "Verification",
      entityId: verification.id,
    });

    return toIdentityResult(verification);
  }

  async verifyIdentity(
    userId: string,
    role: UserRole,
    input: IdentityVerifyInput
  ): Promise<IdentityVerificationResult> {
    throw new AppError(
      "Please upload identity documents using the verification form.",
      400
    );
  }

  async submitGhanaCard(userId: string, role: UserRole, input: GhanaCardVerifyInput) {
    return this.verifyIdentity(userId, role, toIdentityVerifyInput(input));
  }

  private async setProfilePendingIdentity(
    userId: string,
    role: UserRole,
    nationalId: string
  ) {
    const status = "KYC_PENDING";

    if (role === "BUYER") {
      await prisma.tenant.update({
        where: { userId },
        data: { nationalId, profileStatus: status, entityType: "INDIVIDUAL" },
      });
    } else if (role === "MERCHANT") {
      await prisma.landlord.update({
        where: { userId },
        data: { nationalId, profileStatus: status, entityType: "INDIVIDUAL" },
      });
    } else if (role === "LENDER") {
      await prisma.lender.update({
        where: { userId },
        data: { nationalId, profileStatus: status },
      });
    } else if (role === "MARKETER") {
      await prisma.agentProfile.update({
        where: { userId },
        data: { profileStatus: status },
      });
    }
  }

  async addBankAccount(userId: string, input: BankAccountInput) {
    if (input.accountType === "BANK") {
      const allowedProviders = await getAllowedPayoutBankProviders();
      assertAllowedPayoutBank({
        accountType: input.accountType,
        bankCode: input.bankCode,
        bankName: input.bankName,
        providers: allowedProviders,
      });
    }

    let validation: BankValidationOutcome;
    let providerName: string;
    let verifiedAccountName = input.accountName.trim();

    if (isPaystackConfigured()) {
      const paystackValidation = await validateBankAccountWithPaystack({
        accountType: input.accountType,
        bankCode: input.bankCode,
        bankName: input.bankName,
        accountNumber: input.accountNumber,
        accountName: input.accountName,
      });
      validation = paystackValidation;
      providerName = "paystack";
      if (paystackValidation.resolvedAccountName?.trim()) {
        verifiedAccountName = paystackValidation.resolvedAccountName.trim();
      }
    } else {
      const provider = getKycProvider();
      validation = await provider.validateBankAccount({
        accountType: input.accountType,
        bankCode: input.bankCode,
        bankName: input.bankName,
        accountNumber: input.accountNumber,
        accountName: input.accountName,
      });
      providerName = provider.name;
    }

    if (validation.status === "FAILED") {
      throw new AppError(
        validation.failureReason ?? "Could not verify this bank or MoMo account.",
        400
      );
    }

    if (input.isDefault) {
      await prisma.bankAccount.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const account = await prisma.bankAccount.create({
      data: {
        userId,
        accountType: input.accountType,
        bankCode: input.bankCode,
        bankName: input.bankName,
        accountNumber: input.accountNumber,
        accountNumberMasked: maskAccountNumber(input.accountNumber),
        accountName: verifiedAccountName,
        isDefault: input.isDefault,
        validationStatus:
          validation.status === "VALIDATED" ? "VALIDATED" : "PENDING",
        isVerified: validation.status === "VALIDATED",
      },
    });

    const verificationStatus: import("@prisma/client").VerificationStatus =
      validation.status === "VALIDATED"
        ? "APPROVED"
        : validation.status === "FAILED" && !validation.requiresManualReview
          ? "REJECTED"
          : "PENDING";

    await prisma.verification.create({
      data: {
        userId,
        type: "BANK",
        status: verificationStatus,
        providerName,
        providerReference:
          validation.status === "VALIDATED" ? validation.providerReference : undefined,
        failureReason:
          validation.status === "FAILED" ? validation.failureReason : undefined,
        verifiedAt: validation.status === "VALIDATED" ? new Date() : undefined,
        data: {
          bankAccountId: account.id,
          bankName: input.bankName,
          accountName: verifiedAccountName,
          requiresManualReview:
            validation.status === "VALIDATED"
              ? false
              : validation.requiresManualReview ?? true,
        },
      },
    });

    if (validation.status === "VALIDATED") {
      const accountLabel =
        input.accountType === "MOMO" ? "Mobile Money account" : "bank account";
      await notifyUser(
        userId,
        `${accountLabel} verified`,
        `Your ${input.bankName} ${accountLabel} ending in ${input.accountNumber.slice(-4)} was verified and saved successfully.`
      );
    } else if (validation.status === "PENDING") {
      const accountLabel =
        input.accountType === "MOMO" ? "Mobile Money account" : "bank account";
      await notifyUser(
        userId,
        `${accountLabel} saved for review`,
        `Your ${input.bankName} ${accountLabel} ending in ${input.accountNumber.slice(-4)} was saved and is pending verification. We will notify you once it is approved.`
      );
      await notifyAdmins(
        "Bank account validation exception",
        `${verifiedAccountName} submitted bank/MoMo details for manual review.`
      );
    }

    await auditService.log({
      userId,
      action: "BANK_ACCOUNT_ADDED",
      entity: "BankAccount",
      entityId: account.id,
      metadata: {
        providerName,
        validationStatus: validation.status,
      },
    });

    return prisma.bankAccount.findUniqueOrThrow({ where: { id: account.id } });
  }

  async deleteBankAccount(userId: string, bankAccountId: string) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, userId },
    });

    if (!account) {
      throw new AppError("Bank or MoMo account not found", 404);
    }

    const pendingWithdrawal = await prisma.withdrawalRequest.findFirst({
      where: {
        bankAccountId,
        userId,
        status: { in: ["PENDING", "OTP_VERIFIED"] },
      },
    });

    if (pendingWithdrawal) {
      throw new AppError("Cannot remove an account with a withdrawal in progress.");
    }

    await prisma.bankAccount.delete({ where: { id: bankAccountId } });

    await auditService.log({
      userId,
      action: "BANK_ACCOUNT_DELETED",
      entity: "BankAccount",
      entityId: bankAccountId,
      metadata: {
        bankName: account.bankName,
        accountType: account.accountType,
      },
    });

    return { deleted: true };
  }

  async getVerificationStatus(userId: string, role: UserRole) {
    const [user, tenant, landlord, lender, agent, verifications, bankAccounts, kycDocuments] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            image: true,
            phone: true,
            phoneVerified: true,
            updatedAt: true,
            emailVerified: true,
          },
        }),
        prisma.tenant.findUnique({ where: { userId } }),
        prisma.landlord.findUnique({ where: { userId } }),
        prisma.lender.findUnique({ where: { userId } }),
        prisma.agentProfile.findUnique({ where: { userId } }),
        prisma.verification.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          include: { documents: true },
        }),
        prisma.bankAccount.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.kycDocument.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const profile =
      role === "BUYER"
        ? tenant
        : role === "MERCHANT"
          ? landlord
          : role === "LENDER"
            ? lender
            : agent;

    const entityType =
      role === "BUYER"
        ? tenant?.entityType ?? "INDIVIDUAL"
        : role === "MERCHANT"
          ? landlord?.entityType ?? "INDIVIDUAL"
          : "INDIVIDUAL";

    const identityVerified =
      role === "BUYER"
        ? (tenant?.kycVerified ?? false)
        : role === "LENDER"
          ? (lender?.identityVerified ?? false) || (lender?.kycVerified ?? false)
          : role === "MERCHANT"
            ? (landlord?.identityVerified ?? false)
            : profile?.profileStatus === "KYC_VERIFIED";

    return {
      emailVerified: Boolean(user?.emailVerified),
      phoneVerified: Boolean(user?.phoneVerified),
      email: user?.email ?? null,
      image: withProfileImageVersion(user?.image, user?.updatedAt),
      phone: user?.phone ?? null,
      fullName: getProfileDisplayName({
        entityType,
        fullName: profile?.fullName ?? null,
        companyName:
          role === "BUYER"
            ? tenant?.companyName
            : role === "MERCHANT"
              ? landlord?.companyName
              : null,
      }),
      contactName: profile?.fullName ?? null,
      profileStatus: profile?.profileStatus ?? "INCOMPLETE",
      entityType,
      employmentStatus:
        role === "BUYER"
          ? tenant?.employmentStatus ?? null
          : role === "MERCHANT"
            ? landlord?.employmentStatus ?? null
            : role === "LENDER"
              ? lender?.employmentStatus ?? null
              : agent?.employmentStatus ?? null,
      dateOfBirth:
        role === "BUYER" && tenant?.dateOfBirth
          ? tenant.dateOfBirth.toISOString().slice(0, 10)
          : role === "MERCHANT" && landlord?.dateOfBirth
            ? landlord.dateOfBirth.toISOString().slice(0, 10)
            : role === "LENDER" && lender?.dateOfBirth
              ? lender.dateOfBirth.toISOString().slice(0, 10)
              : role === "MARKETER" && agent?.dateOfBirth
                ? agent.dateOfBirth.toISOString().slice(0, 10)
                : null,
      occupation:
        role === "BUYER"
          ? tenant?.occupation ?? null
          : role === "MERCHANT"
            ? landlord?.occupation ?? null
            : role === "LENDER"
              ? lender?.lenderType ?? null
              : null,
      employerName:
        role === "BUYER"
          ? tenant?.employerName ?? null
          : role === "MERCHANT"
            ? landlord?.employerName ?? null
            : role === "LENDER"
              ? lender?.institutionName ?? null
              : null,
      monthlyIncome:
        role === "BUYER" && tenant?.monthlyIncome != null
          ? Number(tenant.monthlyIncome)
          : role === "MERCHANT" && landlord?.monthlyIncome != null
            ? Number(landlord.monthlyIncome)
            : null,
      residentialAddress:
        role === "BUYER"
          ? tenant?.residentialAddress ?? null
          : role === "MERCHANT"
            ? landlord?.residentialAddress ?? null
            : role === "LENDER"
              ? lender?.residentialAddress ?? null
            : role === "MARKETER"
              ? agent?.officeAddress ?? null
              : null,
      agencyName: role === "MARKETER" ? agent?.agencyName ?? null : null,
      licenceNumber: role === "MARKETER" ? agent?.licenceNumber ?? null : null,
      region: role === "MARKETER" ? agent?.region ?? null : null,
      institutionName: role === "LENDER" ? lender?.institutionName ?? null : null,
      lenderType: role === "LENDER" ? lender?.lenderType ?? null : null,
      licenceReference: role === "LENDER" ? lender?.licenceReference ?? null : null,
      companyName:
        role === "BUYER"
          ? tenant?.companyName
          : role === "MERCHANT"
            ? landlord?.companyName
            : null,
      companyRegistrationNumber:
        role === "BUYER"
          ? tenant?.companyRegistrationNumber
          : role === "MERCHANT"
            ? landlord?.companyRegistrationNumber
            : null,
      companyRegisteredAddress:
        role === "BUYER"
          ? tenant?.companyRegisteredAddress
          : role === "MERCHANT"
            ? landlord?.companyRegisteredAddress
            : null,
      companyTin:
        role === "BUYER"
          ? tenant?.companyTin
          : role === "MERCHANT"
            ? landlord?.companyTin
            : null,
      kycVerified: identityVerified,
      identityVerified,
      staffId:
        role === "BUYER"
          ? tenant?.staffId ?? null
          : role === "MERCHANT"
            ? landlord?.staffId ?? null
            : role === "LENDER"
              ? lender?.staffId ?? null
              : agent?.staffId ?? null,
      ssnitNumber:
        role === "BUYER"
          ? tenant?.ssnitNumber ?? null
          : role === "MERCHANT"
            ? landlord?.ssnitNumber ?? null
            : role === "LENDER"
              ? lender?.ssnitNumber ?? null
              : agent?.ssnitNumber ?? null,
      nationalId:
        role === "BUYER"
          ? tenant?.nationalId ?? null
          : role === "MERCHANT"
            ? landlord?.nationalId ?? null
            : role === "LENDER"
              ? lender?.nationalId ?? null
              : null,
      employmentVerified:
        role === "BUYER"
          ? (tenant?.employmentVerified ?? false)
          : role === "MERCHANT"
            ? (landlord?.employmentVerified ?? false)
            : role === "LENDER"
              ? (lender?.employmentVerified ?? false)
              : (agent?.employmentVerified ?? false),
      addressVerified:
        role === "BUYER"
          ? (tenant?.addressVerified ?? false)
          : role === "MERCHANT"
            ? (landlord?.addressVerified ?? false)
            : role === "LENDER"
              ? (lender?.addressVerified ?? false)
              : (agent?.addressVerified ?? false),
      displayName: getProfileDisplayName({
        entityType,
        fullName: profile?.fullName ?? null,
        companyName:
          role === "BUYER"
            ? tenant?.companyName
            : role === "MERCHANT"
              ? landlord?.companyName
              : null,
      }),
      kycProvider: "manual",
      verifications,
      kycDocuments,
      bankAccounts: bankAccounts.map((a: BankAccount) => ({
        ...a,
        accountNumber: a.accountNumberMasked ?? maskAccountNumber(a.accountNumber),
      })),
    };
  }

  async validateBankAccount(bankAccountId: string, adminUserId?: string) {
    const account = await prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
    });
    if (!account) throw new AppError("Bank account not found", 404);

    const updated = await prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        validationStatus: "VALIDATED",
        isVerified: true,
      },
    });

    await prisma.verification.updateMany({
      where: {
        userId: account.userId,
        type: "BANK",
        status: "PENDING",
      },
      data: {
        status: "APPROVED",
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        verifiedAt: new Date(),
      },
    });

    await notifyUser(
      account.userId,
      "Bank account validated",
      `Your ${account.bankName} account has been validated.`
    );

    return updated;
  }

  async approveIdentityVerification(verificationId: string, adminUserId: string) {
    const verification = await prisma.verification.findUnique({
      where: { id: verificationId },
      include: {
        user: { select: { id: true, role: true } },
        documents: true,
      },
    });
    if (
      !verification ||
      !["IDENTITY", "KYB", "EMPLOYMENT", "ADDRESS"].includes(verification.type)
    ) {
      throw new AppError("Verification not found", 404);
    }
    if (verification.status !== "PENDING") {
      throw new AppError("Verification is not pending");
    }

    const data = verification.data as VerificationData;
    const role = data.role ?? verification.user.role;
    const nationalId = data.idNumber ?? data.ghanaCardNumber;

    await prisma.verification.update({
      where: { id: verificationId },
      data: {
        status: "APPROVED",
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        verifiedAt: new Date(),
        failureReason: null,
      },
    });

    if (verification.type === "IDENTITY" || verification.type === "KYB") {
      await this.markIdentityApproved(
        verification.userId,
        role,
        nationalId,
        data.entityType
      );
    } else if (verification.type === "EMPLOYMENT") {
      await this.markEmploymentApproved(verification.userId, role, data.staffId);
    } else if (verification.type === "ADDRESS") {
      await this.markAddressApproved(verification.userId, role);
    }

    const titles: Record<string, { approved: string; body: string }> = {
      KYB: {
        approved: "Business verification approved",
        body: "Your company registration has been approved.",
      },
      IDENTITY: {
        approved: "Identity verified",
        body: "Your identity verification has been approved.",
      },
      EMPLOYMENT: {
        approved: "Employment verified",
        body: "Your employment details have been verified.",
      },
      ADDRESS: {
        approved: "Address verified",
        body: "Your residential address has been verified.",
      },
    };
    const copy = titles[verification.type] ?? titles.IDENTITY;

    await notifyUser(
      verification.userId,
      copy.approved,
      `${copy.body} You can now access verified features.`
    );

    const approveActions: Record<string, string> = {
      KYB: "KYB_APPROVED",
      IDENTITY: "IDENTITY_APPROVED",
      EMPLOYMENT: "EMPLOYMENT_APPROVED",
      ADDRESS: "ADDRESS_APPROVED",
    };

    await auditService.log({
      userId: adminUserId,
      action: approveActions[verification.type] ?? "VERIFICATION_APPROVED",
      entity: "Verification",
      entityId: verificationId,
    });

    await this.maybeNotifyFullKycVerification(verification.userId, role);

    return verification;
  }

  private isKycFullyVerified(
    status: Awaited<ReturnType<KycService["getVerificationStatus"]>>
  ) {
    const profileComplete = ["PROFILE_COMPLETED", "KYC_PENDING", "KYC_VERIFIED"].includes(
      status.profileStatus
    );
    const identityOk = Boolean(status.identityVerified);
    const addressOk = Boolean(status.addressVerified);
    const employmentOk = isEmploymentRecorded(
      status.employmentStatus,
      profileComplete,
      status.employmentVerified
    );

    return identityOk && addressOk && employmentOk;
  }

  private async maybeNotifyFullKycVerification(userId: string, role: UserRole) {
    const status = await this.getVerificationStatus(userId, role);
    if (!this.isKycFullyVerified(status)) return;

    const contact = await getUserContactLines(userId);
    await notifyUser(
      userId,
      "Account fully verified",
      `Congratulations${contact.displayName ? `, ${contact.displayName}` : ""}! Your identity, employment, and address verifications are complete. Your PayRent account is now fully verified.`
    );
  }

  async rejectIdentityVerification(
    verificationId: string,
    adminUserId: string,
    reason: string
  ) {
    const verification = await prisma.verification.findUnique({
      where: { id: verificationId },
      include: { user: { select: { id: true, role: true } } },
    });
    if (
      !verification ||
      !["IDENTITY", "KYB", "EMPLOYMENT", "ADDRESS"].includes(verification.type)
    ) {
      throw new AppError("Verification not found", 404);
    }
    if (verification.status !== "PENDING") {
      throw new AppError("Verification is not pending");
    }

    await prisma.verification.update({
      where: { id: verificationId },
      data: {
        status: "REJECTED",
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        failureReason: reason,
      },
    });

    const rejectTitles: Record<string, string> = {
      KYB: "Business verification rejected",
      IDENTITY: "Identity verification rejected",
      EMPLOYMENT: "Employment verification rejected",
      ADDRESS: "Address verification rejected",
    };

    await notifyUser(
      verification.userId,
      rejectTitles[verification.type] ?? "Verification rejected",
      reason
    );

    const rejectActions: Record<string, string> = {
      KYB: "KYB_REJECTED",
      IDENTITY: "IDENTITY_REJECTED",
      EMPLOYMENT: "EMPLOYMENT_REJECTED",
      ADDRESS: "ADDRESS_REJECTED",
    };

    await auditService.log({
      userId: adminUserId,
      action: rejectActions[verification.type] ?? "VERIFICATION_REJECTED",
      entity: "Verification",
      entityId: verificationId,
      metadata: { reason },
    });

    return verification;
  }

  private async markIdentityApproved(
    userId: string,
    role: UserRole,
    nationalId?: string,
    entityType: EntityType = "INDIVIDUAL"
  ) {
    if (role === "BUYER") {
      await prisma.tenant.update({
        where: { userId },
        data: {
          nationalId,
          entityType,
          kycVerified: true,
          profileStatus: "KYC_VERIFIED",
        },
      });
    } else if (role === "MERCHANT") {
      await prisma.landlord.update({
        where: { userId },
        data: {
          nationalId,
          entityType,
          identityVerified: true,
          profileStatus: "KYC_VERIFIED",
        },
      });
    } else if (role === "LENDER") {
      await prisma.lender.update({
        where: { userId },
        data: {
          nationalId,
          kycVerified: true,
          identityVerified: true,
          profileStatus: "KYC_VERIFIED",
        },
      });
    } else if (role === "MARKETER") {
      await prisma.agentProfile.update({
        where: { userId },
        data: { profileStatus: "KYC_VERIFIED" },
      });
    }
  }

  private async getProfileSnapshot(userId: string, role: UserRole) {
    const profile = await this.getRoleProfile(userId, role);
    if (!profile) return {};

    const entityType = "entityType" in profile ? profile.entityType : "INDIVIDUAL";
    const companyName = "companyName" in profile ? profile.companyName : null;

    return {
      employmentStatus: profile.employmentStatus ?? undefined,
      occupation:
        "occupation" in profile
          ? profile.occupation ?? undefined
          : "lenderType" in profile
            ? profile.lenderType ?? undefined
            : undefined,
      employerName:
        "employerName" in profile
          ? profile.employerName ?? undefined
          : "institutionName" in profile
            ? profile.institutionName ?? undefined
            : undefined,
      staffId: profile.staffId ?? undefined,
      entityType,
      fullName: profile.fullName,
      companyName: companyName ?? undefined,
    } satisfies Partial<VerificationData>;
  }

  private async getRoleProfile(userId: string, role: UserRole) {
    if (role === "BUYER") return prisma.tenant.findUnique({ where: { userId } });
    if (role === "MERCHANT") return prisma.landlord.findUnique({ where: { userId } });
    if (role === "LENDER") return prisma.lender.findUnique({ where: { userId } });
    return prisma.agentProfile.findUnique({ where: { userId } });
  }

  private async getUserDisplayName(userId: string, role: UserRole) {
    const profile = await this.getRoleProfile(userId, role);
    if (!profile) return null;
    const entityType =
      "entityType" in profile ? profile.entityType : "INDIVIDUAL";
    const companyName = "companyName" in profile ? profile.companyName : null;
    return getProfileDisplayName({
      entityType,
      fullName: profile.fullName,
      companyName,
    });
  }

  private async updateRoleProfile(
    userId: string,
    role: UserRole,
    data: {
      staffId?: string;
      ssnitNumber?: string;
      residentialAddress?: string;
      companyRegisteredAddress?: string;
    }
  ) {
    if (role === "BUYER") {
      await prisma.tenant.update({ where: { userId }, data });
    } else if (role === "MERCHANT") {
      await prisma.landlord.update({ where: { userId }, data });
    } else if (role === "LENDER") {
      await prisma.lender.update({
        where: { userId },
        data: {
          staffId: data.staffId,
          ssnitNumber: data.ssnitNumber,
          residentialAddress: data.residentialAddress,
        },
      });
    } else if (role === "MARKETER") {
      await prisma.agentProfile.update({
        where: { userId },
        data: {
          staffId: data.staffId,
          ssnitNumber: data.ssnitNumber,
          officeAddress: data.residentialAddress ?? data.companyRegisteredAddress,
        },
      });
    }
  }

  private async markEmploymentApproved(
    userId: string,
    role: UserRole,
    staffId?: string
  ) {
    const data = { employmentVerified: true, ...(staffId ? { staffId } : {}) };
    if (role === "BUYER") {
      await prisma.tenant.update({ where: { userId }, data });
    } else if (role === "MERCHANT") {
      await prisma.landlord.update({ where: { userId }, data });
    } else if (role === "LENDER") {
      await prisma.lender.update({ where: { userId }, data });
    } else if (role === "MARKETER") {
      await prisma.agentProfile.update({ where: { userId }, data });
    }
  }

  private async markAddressApproved(userId: string, role: UserRole) {
    const data = { addressVerified: true };
    if (role === "BUYER") {
      await prisma.tenant.update({ where: { userId }, data });
    } else if (role === "MERCHANT") {
      await prisma.landlord.update({ where: { userId }, data });
    } else if (role === "LENDER") {
      await prisma.lender.update({ where: { userId }, data });
    } else if (role === "MARKETER") {
      await prisma.agentProfile.update({ where: { userId }, data });
    }
  }

  async getPendingKycReviews() {
    type PendingReview = Prisma.VerificationGetPayload<{
      include: {
        user: {
          select: {
            id: true;
            email: true;
            phone: true;
            role: true;
            tenant: {
              select: {
                fullName: true;
                companyName: true;
                entityType: true;
                employmentStatus: true;
                occupation: true;
                employerName: true;
                staffId: true;
                residentialAddress: true;
              };
            };
            landlord: {
              select: {
                fullName: true;
                companyName: true;
                entityType: true;
                employmentStatus: true;
                occupation: true;
                employerName: true;
                staffId: true;
                residentialAddress: true;
              };
            };
            lender: {
              select: {
                fullName: true;
                employmentStatus: true;
                lenderType: true;
                institutionName: true;
                staffId: true;
                residentialAddress: true;
              };
            };
            agentProfile: {
              select: {
                fullName: true;
                employmentStatus: true;
                officeAddress: true;
                staffId: true;
              };
            };
          };
        };
        documents: true;
      };
    }>;

    const pending = (await prisma.verification.findMany({
      where: {
        status: "PENDING",
        type: {
          in: ["KYC", "IDENTITY", "KYB", "EMPLOYMENT", "ADDRESS"],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            tenant: {
              select: {
                fullName: true,
                companyName: true,
                entityType: true,
                employmentStatus: true,
                occupation: true,
                employerName: true,
                staffId: true,
                residentialAddress: true,
              },
            },
            landlord: {
              select: {
                fullName: true,
                companyName: true,
                entityType: true,
                employmentStatus: true,
                occupation: true,
                employerName: true,
                staffId: true,
                residentialAddress: true,
              },
            },
            lender: {
              select: {
                fullName: true,
                employmentStatus: true,
                lenderType: true,
                institutionName: true,
                staffId: true,
                residentialAddress: true,
              },
            },
            agentProfile: {
              select: {
                fullName: true,
                employmentStatus: true,
                officeAddress: true,
                staffId: true,
              },
            },
          },
        },
        documents: true,
      },
      orderBy: { createdAt: "desc" },
    })) as PendingReview[];

    return pending.filter((review: PendingReview) => {
      const data = review.data as VerificationData | null;
      if (review.providerName === "manual") return true;
      return requiresManualReview(data);
    });
  }

  async getApprovedKycHistory() {
    return prisma.verification.findMany({
      where: {
        status: "APPROVED",
        type: {
          in: ["KYC", "IDENTITY", "KYB", "EMPLOYMENT", "ADDRESS"],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            tenant: { select: { fullName: true, companyName: true } },
            landlord: { select: { fullName: true, companyName: true } },
            lender: { select: { fullName: true, institutionName: true } },
            agentProfile: { select: { fullName: true } },
          },
        },
        documents: true,
      },
      orderBy: { verifiedAt: "desc" },
      take: 200,
    });
  }
}

export const kycService = new KycService();
