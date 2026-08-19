import { prisma, runTransaction } from "@/lib/db/prisma";
import {
  notifyAllAdminsInAppAndEmail,
  notifyUserInAppAndEmail,
} from "@/lib/services/verification-notifications";
import { auditService } from "@/lib/services/audit.service";
import { AppError } from "@/lib/errors";
import { getMandateProvider } from "@/lib/integrations/mandate";
import type {
  CreateMandateInput,
  SubmitMandateInput,
  ReviewMandateInput,
} from "@/lib/validations/mandate";

const SUBMITTABLE = new Set(["DRAFT", "PENDING_SUBMISSION"]);
const REVIEWABLE = new Set(["ADMIN_REVIEW", "PENDING_MANUAL_RESOLUTION"]);

export class MandateService {
  private async activateMandate(mandateId: string, adminUserId?: string) {
    const mandate = await prisma.mandate.findUnique({
      where: { id: mandateId },
      include: {
        tenant: { include: { user: true } },
        financingRequest: true,
      },
    });
    if (!mandate) throw new AppError("Mandate not found", 404);

    await runTransaction(async (db) => {
      await db.mandate.update({
        where: { id: mandateId },
        data: { status: "ACTIVE", activatedAt: new Date() },
      });

      await db.adminReviewRecord.updateMany({
        where: {
          relatedEntityType: "Mandate",
          relatedEntityId: mandateId,
          status: "PENDING",
        },
        data: {
          status: "APPROVED",
          assignedAdminUserId: adminUserId,
          decision: "APPROVE",
          completedAt: new Date(),
        },
      });
    });

    if (mandate.financingRequest?.buyerAcceptedAt) {
      const { financingService } = await import("@/lib/services/financing.service");
      await financingService.completeFinancingDisbursement(mandate.financingRequest.id);
    }

    await notifyUserInAppAndEmail(
      mandate.tenant.userId,
      mandate.financingRequest?.buyerAcceptedAt
        ? "Mandate activated — financing disbursed"
        : "Mandate activated",
      mandate.financingRequest?.buyerAcceptedAt
        ? "Your repayment mandate is active and financing has been disbursed to the merchant."
        : "Your repayment mandate is active."
    );

    if (adminUserId) {
      await auditService.log({
        userId: adminUserId,
        action: "MANDATE_ACTIVATED",
        entity: "Mandate",
        entityId: mandateId,
      });
    }

    return prisma.mandate.findUniqueOrThrow({ where: { id: mandateId } });
  }

  async createDraftForFinancing(
    tenantId: string,
    userId: string,
    financingRequestId: string,
    bankAccountId: string
  ) {
    const financing = await prisma.financingRequest.findFirst({
      where: { id: financingRequestId, tenantId },
    });
    if (!financing || financing.mandateId) return null;

    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, userId, isVerified: true },
    });
    if (!bankAccount) return null;

    const provider = getMandateProvider();

    return runTransaction(async (db) => {
      const created = await db.mandate.create({
        data: {
          tenantId,
          bankAccountId,
          mandateType: "DIRECT_DEBIT",
          mandateSource: "PLATFORM_GENERATED",
          status: "DRAFT",
          providerName: provider.name,
        },
      });

      await db.financingRequest.update({
        where: { id: financingRequestId },
        data: { mandateId: created.id },
      });

      return created;
    });
  }

  async submitDraftToBank(mandateId: string, tenantId: string, userId: string) {
    const mandate = await prisma.mandate.findFirst({
      where: { id: mandateId, tenantId },
      include: { financingRequest: true },
    });
    if (!mandate) throw new AppError("Mandate not found", 404);
    if (mandate.status !== "DRAFT") {
      throw new AppError("Mandate has already been submitted to the bank", 400);
    }
    if (mandate.mandateSource !== "PLATFORM_GENERATED") {
      throw new AppError("Only platform-generated mandates can be sent to the bank automatically", 400);
    }

    const provider = getMandateProvider();
    const registration = await provider.registerPlatformMandate({
      mandateId: mandate.id,
      bankAccountId: mandate.bankAccountId,
      tenantUserId: userId,
    });

    const updated = await prisma.mandate.update({
      where: { id: mandate.id },
      data: {
        providerReference: registration.providerReference,
        documentUrl: registration.documentUrl ?? mandate.documentUrl,
        status: registration.status,
        submittedAt: new Date(),
      },
    });

    if (mandate.financingRequest) {
      await prisma.financingRequest.update({
        where: { id: mandate.financingRequest.id },
        data: { status: "MANDATE_PENDING" },
      });
    }

    if (registration.status === "ACTIVE") {
      return this.activateMandate(mandate.id);
    }

    if (registration.status === "PENDING_MANUAL_RESOLUTION") {
      await prisma.adminReviewRecord.create({
        data: {
          reviewType: "MANDATE",
          relatedEntityType: "Mandate",
          relatedEntityId: mandate.id,
          status: "PENDING",
        },
      });
      await notifyAllAdminsInAppAndEmail(
        "Mandate pending review",
        `Mandate ${mandate.id} requires administrator review.`
      );
    }

    if (registration.status === "BANK_PROCESSING") {
      return this.syncBankStatus(mandate.id);
    }

    await auditService.log({
      userId,
      action: "MANDATE_SUBMITTED_TO_BANK",
      entity: "Mandate",
      entityId: mandate.id,
    });

    return updated;
  }

  async create(tenantId: string, userId: string, input: CreateMandateInput) {
    const financing = await prisma.financingRequest.findFirst({
      where: { id: input.financingRequestId, tenantId },
    });
    if (!financing) throw new AppError("Financing request not found", 404);
    if (financing.mandateId) {
      throw new AppError("A mandate already exists for this financing request", 409);
    }

    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, userId },
    });
    if (!bankAccount) throw new AppError("Bank account not found", 404);
    if (!bankAccount.isVerified) {
      throw new AppError("Bank account must be validated before creating a mandate", 400);
    }

    const provider = getMandateProvider();
    const initialStatus =
      input.mandateSource === "SCANNED_UPLOAD" ? "PENDING_SUBMISSION" : "DRAFT";

    const mandate = await runTransaction(async (db) => {
      const created = await db.mandate.create({
        data: {
          tenantId,
          bankAccountId: input.bankAccountId,
          mandateType: input.mandateType,
          mandateSource: input.mandateSource,
          status: initialStatus,
          documentUrl: input.documentUrl,
          providerName: provider.name,
        },
      });

      await db.financingRequest.update({
        where: { id: input.financingRequestId },
        data: { mandateId: created.id, status: "MANDATE_PENDING" },
      });

      return created;
    });

    if (input.mandateSource === "PLATFORM_GENERATED") {
      const registration = await provider.registerPlatformMandate({
        mandateId: mandate.id,
        bankAccountId: input.bankAccountId,
        tenantUserId: userId,
      });

      const updated = await prisma.mandate.update({
        where: { id: mandate.id },
        data: {
          providerReference: registration.providerReference,
          documentUrl: registration.documentUrl ?? mandate.documentUrl,
          status: registration.status,
          submittedAt: new Date(),
        },
      });

      if (registration.status === "ACTIVE") {
        return this.activateMandate(mandate.id);
      }

      if (registration.status === "PENDING_MANUAL_RESOLUTION") {
        await prisma.adminReviewRecord.create({
          data: {
            reviewType: "MANDATE",
            relatedEntityType: "Mandate",
            relatedEntityId: mandate.id,
            status: "PENDING",
          },
        });
        await notifyAllAdminsInAppAndEmail(
          "Mandate pending review",
          `Mandate ${mandate.id} requires administrator review.`
        );
      }

      if (registration.status === "BANK_PROCESSING") {
        return this.syncBankStatus(mandate.id);
      }

      await auditService.log({
        userId,
        action: "MANDATE_CREATED",
        entity: "Mandate",
        entityId: mandate.id,
      });

      return updated;
    }

    await auditService.log({
      userId,
      action: "MANDATE_CREATED",
      entity: "Mandate",
      entityId: mandate.id,
    });

    return mandate;
  }

  async submit(mandateId: string, tenantId: string, userId: string, input: SubmitMandateInput) {
    const mandate = await prisma.mandate.findFirst({
      where: { id: mandateId, tenantId },
    });
    if (!mandate) throw new AppError("Mandate not found", 404);
    if (!SUBMITTABLE.has(mandate.status)) {
      throw new AppError("Mandate cannot be submitted in its current status", 400);
    }
    if (mandate.mandateSource === "SCANNED_UPLOAD" && !input.documentUrl && !mandate.documentUrl) {
      throw new AppError("Upload a scanned mandate document before submitting", 400);
    }

    const updated = await prisma.mandate.update({
      where: { id: mandateId },
      data: {
        status: "ADMIN_REVIEW",
        documentUrl: input.documentUrl ?? mandate.documentUrl,
        submittedAt: new Date(),
      },
    });

    await prisma.adminReviewRecord.create({
      data: {
        reviewType: "MANDATE",
        relatedEntityType: "Mandate",
        relatedEntityId: mandateId,
        status: "PENDING",
      },
    });

    await notifyAdminsMandateReview(mandateId);

    await notifyUserInAppAndEmail(
      userId,
      "Mandate submitted",
      "Your repayment mandate has been submitted and is pending administrator review."
    );

    await auditService.log({
      userId,
      action: "MANDATE_SUBMITTED",
      entity: "Mandate",
      entityId: mandateId,
    });

    return updated;
  }

  async review(mandateId: string, adminUserId: string, input: ReviewMandateInput) {
    const mandate = await prisma.mandate.findUnique({
      where: { id: mandateId },
      include: {
        tenant: { include: { user: true } },
        financingRequest: true,
      },
    });
    if (!mandate) throw new AppError("Mandate not found", 404);
    if (!REVIEWABLE.has(mandate.status)) {
      throw new AppError("Mandate is not pending review", 400);
    }

    if (input.decision === "REJECT") {
      await runTransaction(async (db) => {
        await db.mandate.update({
          where: { id: mandateId },
          data: {
            status: "REJECTED",
            rejectedReason: input.rejectedReason ?? "Rejected by administrator",
          },
        });
        await db.adminReviewRecord.updateMany({
          where: {
            relatedEntityType: "Mandate",
            relatedEntityId: mandateId,
            status: "PENDING",
          },
          data: {
            status: "REJECTED",
            assignedAdminUserId: adminUserId,
            decision: "REJECT",
            decisionNote: input.rejectedReason,
            completedAt: new Date(),
          },
        });
      });

      await notifyUserInAppAndEmail(
        mandate.tenant.userId,
        "Mandate rejected",
        input.rejectedReason ?? "Your mandate was rejected. Please upload a new document."
      );

      await auditService.log({
        userId: adminUserId,
        action: "MANDATE_REJECTED",
        entity: "Mandate",
        entityId: mandateId,
      });

      return prisma.mandate.findUniqueOrThrow({ where: { id: mandateId } });
    }

    await prisma.mandate.update({
      where: { id: mandateId },
      data: { status: "BANK_PROCESSING" },
    });

    await auditService.log({
      userId: adminUserId,
      action: "MANDATE_APPROVED",
      entity: "Mandate",
      entityId: mandateId,
    });

    return this.syncBankStatus(mandateId, adminUserId);
  }

  async syncBankStatus(mandateId: string, adminUserId?: string) {
    const mandate = await prisma.mandate.findUnique({ where: { id: mandateId } });
    if (!mandate?.providerReference) {
      if (mandate?.status === "BANK_PROCESSING") {
        return this.activateMandate(mandateId, adminUserId);
      }
      return mandate;
    }

    const provider = getMandateProvider();
    const bankStatus = await provider.confirmMandateStatus(mandate.providerReference);

    if (bankStatus === "ACTIVE") {
      return this.activateMandate(mandateId, adminUserId);
    }

    if (bankStatus === "REJECTED") {
      await prisma.mandate.update({
        where: { id: mandateId },
        data: {
          status: "PENDING_MANUAL_RESOLUTION",
          rejectedReason: "Bank rejected mandate registration",
        },
      });
      await prisma.adminReviewRecord.create({
        data: {
          reviewType: "MANDATE",
          relatedEntityType: "Mandate",
          relatedEntityId: mandateId,
          status: "PENDING",
        },
      });
      await notifyAllAdminsInAppAndEmail(
        "Mandate pending review",
        `Mandate ${mandateId} requires administrator review after bank rejection.`
      );
    }

    return prisma.mandate.findUniqueOrThrow({ where: { id: mandateId } });
  }

  async listForTenant(tenantId: string) {
    return prisma.mandate.findMany({
      where: { tenantId },
      include: { bankAccount: true, financingRequest: { include: { property: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async listPendingReview() {
    return prisma.mandate.findMany({
      where: { status: { in: ["ADMIN_REVIEW", "PENDING_MANUAL_RESOLUTION"] } },
      include: {
        tenant: { include: { user: { select: { email: true } } } },
        bankAccount: true,
        financingRequest: { include: { property: true } },
      },
      orderBy: { submittedAt: "desc" },
    });
  }

  async getById(mandateId: string, tenantId?: string) {
    return prisma.mandate.findFirst({
      where: { id: mandateId, ...(tenantId ? { tenantId } : {}) },
      include: {
        bankAccount: true,
        financingRequest: { include: { property: true } },
      },
    });
  }
}

async function notifyAdminsMandateReview(mandateId: string) {
  await notifyAllAdminsInAppAndEmail(
    "Mandate pending review",
    `Mandate ${mandateId} requires administrator review.`
  );
}

export const mandateService = new MandateService();
