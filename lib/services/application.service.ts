import { prisma } from "@/lib/db/prisma";
import { notificationService } from "@/lib/services/notification.service";
import { auditService } from "@/lib/services/audit.service";
import { AppError } from "@/lib/errors";
import type { CreateApplicationInput, ReviewApplicationInput, RespondToClarificationInput } from "@/lib/validations/application";

export class ApplicationService {
  async create(
    tenantId: string,
    userId: string,
    input: CreateApplicationInput,
    referredAgentProfileId?: string | null
  ) {
    const property = await prisma.property.findUnique({
      where: { id: input.propertyId },
      include: {
        landlord: { include: { user: true } },
        assignedAgent: { include: { user: { select: { id: true } } } },
      },
    });

    if (!property || property.status !== "ACTIVE") {
      throw new AppError("Property is not available for applications", 400);
    }

    const existing = await prisma.propertyApplication.findFirst({
      where: {
        tenantId,
        propertyId: input.propertyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "CLARIFICATION_REQUIRED", "APPROVED"] },
      },
    });
    if (existing) {
      throw new AppError("You already have an active application for this property", 409);
    }

    const application = await prisma.propertyApplication.create({
      data: {
        propertyId: input.propertyId,
        tenantId,
        referredAgentProfileId: referredAgentProfileId ?? undefined,
        status: "SUBMITTED",
        requestedMoveInDate: input.requestedMoveInDate
          ? new Date(input.requestedMoveInDate)
          : undefined,
        notes: input.notes,
      },
      include: {
        property: { include: { images: { take: 1 } } },
        tenant: { include: { user: true } },
      },
    });

    await notificationService.create({
      userId: property.landlord.userId,
      title: "New Customer application",
      body: `A Customer applied for ${property.name}.`,
    });

    if (property.assignedAgent?.user.id) {
      await notificationService.create({
        userId: property.assignedAgent.user.id,
        title: "New inquiry on your listing",
        body: `A Customer applied for ${property.name}, which you represent as an Affiliate.`,
        metadata: { propertyId: property.id, applicationId: application.id },
      });
    }

    await auditService.log({
      userId,
      action: "APPLICATION_SUBMITTED",
      entity: "PropertyApplication",
      entityId: application.id,
    });

    return application;
  }

  async listForTenant(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { userId: true },
    });

    const apps = await prisma.propertyApplication.findMany({
      where: { tenantId },
      include: {
        property: { include: { images: { take: 1 }, landlord: true } },
        documents: true,
        financingRequests: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!tenant) return apps;

    const payments = await prisma.walletTransaction.findMany({
      where: {
        wallet: { userId: tenant.userId, type: "BUYER" },
        type: "PAYMENT",
        status: "COMPLETED",
      },
      select: { metadata: true },
    });

    const paidApplicationIds = new Set(
      payments
        .map((payment) => (payment.metadata as { applicationId?: string } | null)?.applicationId)
        .filter((id): id is string => Boolean(id))
    );

    return apps.map((app) => {
      const paidWithCash = paidApplicationIds.has(app.id);
      const hasFinancing = app.financingRequests.length > 0;

      return {
        ...app,
        paymentMethod: paidWithCash ? "CASH" : hasFinancing ? "FINANCING" : null,
        paymentLabel: paidWithCash
          ? "Paid with wallet (cash)"
          : hasFinancing
            ? "Financing requested"
            : null,
      };
    });
  }

  async listForLandlord(landlordId: string) {
    return prisma.propertyApplication.findMany({
      where: { property: { landlordId } },
      include: {
        property: { include: { images: { take: 1 } } },
        tenant: { include: { user: { select: { email: true, phone: true } } } },
        documents: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async listForAgent(agentProfileId: string) {
    return prisma.propertyApplication.findMany({
      where: { property: { agentUserId: agentProfileId } },
      include: {
        property: { include: { images: { take: 1 } } },
        tenant: { include: { user: { select: { email: true, phone: true } } } },
        documents: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async addDocument(
    applicationId: string,
    tenantId: string,
    fileName: string,
    fileUrl: string,
    documentType = "SUPPORTING"
  ) {
    const application = await prisma.propertyApplication.findFirst({
      where: { id: applicationId, tenantId },
    });
    if (!application) throw new AppError("Application not found", 404);

    return prisma.applicationDocument.create({
      data: { applicationId, fileName, fileUrl, documentType },
    });
  }

  async review(
    applicationId: string,
    reviewerUserId: string,
    input: ReviewApplicationInput
  ) {
    const application = await prisma.propertyApplication.findUnique({
      where: { id: applicationId },
      include: {
        property: { include: { landlord: true } },
        tenant: { include: { user: true } },
      },
    });

    if (!application) throw new AppError("Application not found", 404);

    const property = application.property;
    const reviewer = await prisma.user.findUnique({
      where: { id: reviewerUserId },
      include: { landlord: true, agentProfile: true },
    });

    const canReview =
      (reviewer?.role === "MERCHANT" && reviewer.landlord?.id === property.landlordId) ||
      (reviewer?.role === "MARKETER" && property.agentUserId === reviewer.agentProfile?.id) ||
      reviewer?.role === "ADMIN";

    if (!canReview) {
      throw new AppError("You are not authorized to review this application", 403);
    }

    const statusMap = {
      APPROVE: "APPROVED" as const,
      REJECT: "REJECTED" as const,
      CLARIFICATION: "CLARIFICATION_REQUIRED" as const,
    };

    const updated = await prisma.propertyApplication.update({
      where: { id: applicationId },
      data: {
        status: statusMap[input.decision],
        reviewedBy: reviewerUserId,
        reviewedAt: new Date(),
        decisionReason: input.decisionReason,
      },
      include: { property: true },
    });

    const notificationCopy = {
      APPROVE: {
        title: "Application approved",
        body: `Your application for ${application.property.name} was approved.`,
      },
      REJECT: {
        title: "Application not approved",
        body: input.decisionReason?.trim()
          ? `Your application for ${application.property.name} was not approved: ${input.decisionReason.trim()}`
          : `Your application for ${application.property.name} was not approved.`,
      },
      CLARIFICATION: {
        title: "Clarification requested",
        body: input.decisionReason?.trim()
          ? `The merchant needs more information for your application on ${application.property.name}: ${input.decisionReason.trim()}`
          : `The merchant requested clarification for your application on ${application.property.name}.`,
      },
    }[input.decision];

    await notificationService.create({
      userId: application.tenant.userId,
      title: notificationCopy.title,
      body: notificationCopy.body,
    });

    await auditService.log({
      userId: reviewerUserId,
      action: `APPLICATION_${input.decision}`,
      entity: "PropertyApplication",
      entityId: applicationId,
    });

    return updated;
  }

  async respondToClarification(
    applicationId: string,
    tenantId: string,
    userId: string,
    input: RespondToClarificationInput
  ) {
    const application = await prisma.propertyApplication.findFirst({
      where: { id: applicationId, tenantId },
      include: {
        property: { include: { landlord: { include: { user: true } } } },
        documents: true,
      },
    });

    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (application.status !== "CLARIFICATION_REQUIRED") {
      throw new AppError("This application is not waiting for clarification", 400);
    }

    const responseNote = input.responseNote?.trim();
    if (!responseNote && application.documents.length === 0) {
      throw new AppError(
        "Add a response note or upload at least one supporting document before submitting.",
        400
      );
    }

    const notes = responseNote
      ? [application.notes?.trim(), `Buyer response: ${responseNote}`]
          .filter(Boolean)
          .join("\n\n")
      : application.notes;

    const updated = await prisma.propertyApplication.update({
      where: { id: applicationId },
      data: {
        status: "UNDER_REVIEW",
        notes,
        reviewedAt: null,
        reviewedBy: null,
      },
      include: {
        property: { include: { images: { take: 1 } } },
        documents: true,
        financingRequests: { select: { id: true, status: true } },
      },
    });

    await notificationService.create({
      userId: application.property.landlord.userId,
      title: "Application clarification received",
      body: `The buyer responded to your clarification request for ${application.property.name}.`,
      metadata: { propertyId: application.propertyId, applicationId },
    });

    await auditService.log({
      userId,
      action: "APPLICATION_CLARIFICATION_RESPONDED",
      entity: "PropertyApplication",
      entityId: applicationId,
    });

    return updated;
  }
}

export const applicationService = new ApplicationService();
