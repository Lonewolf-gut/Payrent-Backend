import {
  TenantFinancingDocType,
  type FinancingRequestDocument,
  type PropertyApplication,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { saveFinancingDocument } from "@/lib/integrations/documents";
import {
  FINANCING_DOC_LABELS,
  getRequiredFinancingDocTypes,
} from "@/lib/constants/financing-docs";
import {
  notifyAllAdminsInAppAndEmail,
  notifyUserInAppAndEmail,
} from "@/lib/services/verification-notifications";

type RepaymentPreference = {
  bankAccountId?: string;
  mandateDebitConsent?: boolean;
  preferredChannel?: string;
  preferredPaymentDay?: number;
};

async function assertBuyerOwnsRequest(userId: string, financingRequestId: string) {
  const request = await prisma.financingRequest.findFirst({
    where: { id: financingRequestId, tenant: { userId } },
    include: {
      application: true,
      tenant: {
        include: { user: { select: { email: true } } },
      },
    },
  });
  if (!request) throw new AppError("Financing request not found", 404);
  return request;
}

function canReplaceDocuments(application: PropertyApplication | null | undefined) {
  return application?.status === "SUBMITTED";
}

export class FinancingRequestDocService {
  async listForRequest(userId: string, financingRequestId: string) {
    const request = await assertBuyerOwnsRequest(userId, financingRequestId);
    const requiredTypes = getRequiredFinancingDocTypes(request.tenant.entityType);
    const docs = await prisma.financingRequestDocument.findMany({
      where: { financingRequestId },
      orderBy: { documentType: "asc" },
    });

    return {
      financingRequestId,
      documents: docs,
      requiredTypes,
      labels: FINANCING_DOC_LABELS,
      allApproved: this.areDocsApproved(requiredTypes, docs),
      canReplace: canReplaceDocuments(request.application),
    };
  }

  async listForTenant(userId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { userId } });
    if (!tenant) throw new AppError("Customer profile required", 403);

    const requests = await prisma.financingRequest.findMany({
      where: { tenantId: tenant.id },
      include: {
        documents: { orderBy: { documentType: "asc" } },
        application: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const requiredTypes = getRequiredFinancingDocTypes(tenant.entityType);

    return requests.map((request) => ({
      financingRequestId: request.id,
      propertyId: request.propertyId,
      applicationId: request.applicationId,
      applicationStatus: request.application?.status ?? null,
      documents: request.documents,
      requiredTypes,
      allApproved: this.areDocsApproved(requiredTypes, request.documents),
      canReplace: canReplaceDocuments(request.application),
    }));
  }

  async upload(
    userId: string,
    financingRequestId: string,
    documentType: TenantFinancingDocType,
    file: File
  ) {
    const request = await assertBuyerOwnsRequest(userId, financingRequestId);

    if (!request.tenant.kycVerified) {
      throw new AppError(
        "Complete identity verification on your dashboard before uploading financing documents.",
        403,
        "KYC_REQUIRED"
      );
    }

    const requiredTypes = getRequiredFinancingDocTypes(request.tenant.entityType);
    if (!requiredTypes.includes(documentType)) {
      throw new AppError("This document is not required for your account type.", 400);
    }

    const existing = await prisma.financingRequestDocument.findUnique({
      where: {
        financingRequestId_documentType: { financingRequestId, documentType },
      },
    });

    if (existing?.status === "APPROVED") {
      throw new AppError("Approved documents cannot be replaced.", 400);
    }

    if (existing && !canReplaceDocuments(request.application)) {
      throw new AppError(
        "Documents cannot be changed after the merchant has approved your application.",
        400
      );
    }

    const fileUrl = await saveFinancingDocument(file, userId);
    const doc = await prisma.financingRequestDocument.upsert({
      where: {
        financingRequestId_documentType: { financingRequestId, documentType },
      },
      create: {
        financingRequestId,
        documentType,
        fileName: file.name,
        fileUrl,
        status: "PENDING",
      },
      update: {
        fileName: file.name,
        fileUrl,
        status: "PENDING",
        reviewNotes: null,
        reviewedAt: null,
        reviewedBy: null,
      },
    });

    await notifyUserInAppAndEmail(
      userId,
      "Financing document submitted",
      `Your ${FINANCING_DOC_LABELS[documentType]} for this Pay-for-Me request was uploaded and is pending admin review.`
    );

    await notifyAllAdminsInAppAndEmail(
      "Financing documents submitted",
      `${request.tenant.user.email} uploaded ${FINANCING_DOC_LABELS[documentType]} for admin review.`,
      { financingRequestId, documentId: doc.id }
    );

    return doc;
  }

  async remove(userId: string, financingRequestId: string, documentType: TenantFinancingDocType) {
    const request = await assertBuyerOwnsRequest(userId, financingRequestId);

    if (!canReplaceDocuments(request.application)) {
      throw new AppError(
        "Documents cannot be removed after the merchant has approved your application.",
        400
      );
    }

    const existing = await prisma.financingRequestDocument.findUnique({
      where: {
        financingRequestId_documentType: { financingRequestId, documentType },
      },
    });

    if (!existing) throw new AppError("Document not found", 404);
    if (existing.status === "APPROVED") {
      throw new AppError("Approved documents cannot be removed.", 400);
    }

    await prisma.financingRequestDocument.delete({ where: { id: existing.id } });
    return { removed: true };
  }

  areDocsApproved(
    requiredTypes: TenantFinancingDocType[],
    docs: FinancingRequestDocument[]
  ) {
    return requiredTypes.every((type) =>
      docs.some((doc) => doc.documentType === type && doc.status === "APPROVED")
    );
  }

  async areFinancingDocsApproved(financingRequestId: string) {
    const request = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: { documents: true, tenant: true },
    });
    if (!request) return false;

    const requiredTypes = getRequiredFinancingDocTypes(request.tenant.entityType);
    return this.areDocsApproved(requiredTypes, request.documents);
  }

  async assertFinancingDocsApproved(financingRequestId: string) {
    const approved = await this.areFinancingDocsApproved(financingRequestId);
    if (approved) return;

    const request = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: { documents: true, tenant: true },
    });
    if (!request) throw new AppError("Financing request not found", 404);

    const requiredTypes = getRequiredFinancingDocTypes(request.tenant.entityType);
    const missing = requiredTypes.filter(
      (type) =>
        !request.documents.some(
          (doc) => doc.documentType === type && doc.status === "APPROVED"
        )
    );

    throw new AppError(
      `Upload and get admin approval for: ${missing.map((t) => FINANCING_DOC_LABELS[t]).join(", ")}`,
      400,
      "FINANCING_DOCS_REQUIRED"
    );
  }

  async listForAdmin(status?: "PENDING" | "APPROVED" | "REJECTED") {
    const requests = await prisma.financingRequest.findMany({
      where: status
        ? { documents: { some: { status } } }
        : { documents: { some: {} } },
      include: {
        documents: {
          orderBy: { documentType: "asc" },
        },
        property: { select: { id: true, name: true, location: true } },
        application: { select: { id: true, status: true } },
        tenant: {
          include: {
            user: { select: { id: true, email: true, phone: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const filtered = status
      ? requests.filter((request) => request.documents.length > 0)
      : requests;

    const userIds = [...new Set(filtered.map((request) => request.tenant.userId))];
    const bankAccountIds = [
      ...new Set(
        filtered
          .map((request) => {
            const pref = request.repaymentPreference as RepaymentPreference | null;
            return pref?.bankAccountId;
          })
          .filter(Boolean) as string[]
      ),
    ];

    const [kycDocs, verifications, bankAccounts, approvedHistory] = await Promise.all([
      userIds.length
        ? prisma.kycDocument.findMany({
            where: { userId: { in: userIds } },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      userIds.length
        ? prisma.verification.findMany({
            where: { userId: { in: userIds }, status: "APPROVED" },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      bankAccountIds.length
        ? prisma.bankAccount.findMany({
            where: { id: { in: bankAccountIds } },
          })
        : Promise.resolve([]),
      prisma.financingRequestDocument.findMany({
        where: { status: "APPROVED" },
        include: {
          financingRequest: {
            select: {
              id: true,
              tenantId: true,
              property: { select: { name: true } },
              createdAt: true,
            },
          },
        },
        orderBy: { reviewedAt: "desc" },
      }),
    ]);

    return filtered.map((request) => {
      const pref = request.repaymentPreference as RepaymentPreference | null;
      const bankAccount = bankAccounts.find((account) => account.id === pref?.bankAccountId);

      return {
        financingRequestId: request.id,
        requestedAmount: request.requestedAmount,
        durationMonths: request.durationMonths,
        financingStatus: request.status,
        repaymentPreference: pref,
        bankAccount: bankAccount
          ? {
              id: bankAccount.id,
              bankName: bankAccount.bankName,
              accountName: bankAccount.accountName,
              accountNumberMasked: bankAccount.accountNumberMasked,
              isVerified: bankAccount.isVerified,
            }
          : null,
        property: request.property,
        application: request.application,
        documents: request.documents,
        pendingCount: request.documents.filter((doc) => doc.status === "PENDING").length,
        kycSummary: {
          tenantId: request.tenantId,
          fullName: request.tenant.fullName,
          kycVerified: request.tenant.kycVerified,
          employmentVerified: request.tenant.employmentVerified,
          addressVerified: request.tenant.addressVerified,
          entityType: request.tenant.entityType,
          email: request.tenant.user.email,
          phone: request.tenant.user.phone,
          kycDocuments: kycDocs.filter((item) => item.userId === request.tenant.userId),
          verifications: verifications.filter((item) => item.userId === request.tenant.userId),
        },
        approvedHistory: approvedHistory.filter(
          (doc) => doc.financingRequest.tenantId === request.tenantId
        ),
      };
    });
  }

  async review(
    documentId: string,
    adminUserId: string,
    status: "APPROVED" | "REJECTED",
    reviewNotes?: string
  ) {
    const doc = await prisma.financingRequestDocument.update({
      where: { id: documentId },
      data: {
        status,
        reviewNotes,
        reviewedAt: new Date(),
        reviewedBy: adminUserId,
      },
      include: {
        financingRequest: {
          include: {
            tenant: { include: { user: { select: { id: true, email: true } } } },
            property: { select: { name: true } },
          },
        },
      },
    });

    await notifyUserInAppAndEmail(
      doc.financingRequest.tenant.user.id,
      status === "APPROVED"
        ? "Financing document approved"
        : "Financing document needs attention",
      status === "APPROVED"
        ? `Your ${FINANCING_DOC_LABELS[doc.documentType as TenantFinancingDocType]} for ${doc.financingRequest.property.name} was approved.`
        : `Your ${FINANCING_DOC_LABELS[doc.documentType as TenantFinancingDocType]} for ${doc.financingRequest.property.name} was rejected.${reviewNotes ? ` Note: ${reviewNotes}` : ""}`
    );

    if (status === "APPROVED") {
      const { financingService } = await import("@/lib/services/financing.service");
      await financingService.tryActivatePendingRequests(
        doc.financingRequest.tenantId,
        doc.financingRequest.propertyId
      );

      const allApproved = await this.areFinancingDocsApproved(doc.financingRequestId);
      if (allApproved) {
        await financingService.advanceAfterAdminDocumentApproval(
          doc.financingRequestId,
          adminUserId
        );
      }
    }

    return doc;
  }

  async listApprovedRecords() {
    const docs = await prisma.financingRequestDocument.findMany({
      where: { status: "APPROVED" },
      include: {
        financingRequest: {
          include: {
            property: { select: { id: true, name: true, location: true } },
            tenant: {
              include: {
                user: { select: { id: true, email: true, phone: true } },
              },
            },
          },
        },
      },
      orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
    });

    const groups = new Map<
      string,
      {
        tenantId: string;
        fullName: string;
        email: string;
        phone?: string | null;
        records: typeof docs;
      }
    >();

    for (const doc of docs) {
      const tenantId = doc.financingRequest.tenantId;
      const existing = groups.get(tenantId);
      if (existing) {
        existing.records.push(doc);
        continue;
      }
      groups.set(tenantId, {
        tenantId,
        fullName: doc.financingRequest.tenant.fullName,
        email: doc.financingRequest.tenant.user.email,
        phone: doc.financingRequest.tenant.user.phone,
        records: [doc],
      });
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }
}

export const financingRequestDocService = new FinancingRequestDocService();
