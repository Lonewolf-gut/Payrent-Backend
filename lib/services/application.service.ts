import { prisma } from "@/lib/db/prisma";
import { notificationService } from "@/lib/services/notification.service";
import { auditService } from "@/lib/services/audit.service";
import { AppError } from "@/lib/errors";
import type { CreateApplicationInput, ReviewApplicationInput } from "@/lib/validations/application";

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
    return prisma.propertyApplication.findMany({
      where: { tenantId },
      include: {
        property: { include: { images: { take: 1 }, landlord: true } },
        documents: true,
      },
      orderBy: { createdAt: "desc" },
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

    await notificationService.create({
      userId: application.tenant.userId,
      title: `Application ${statusMap[input.decision].toLowerCase().replace("_", " ")}`,
      body: `Your application for ${application.property.name} was updated.`,
    });

    await auditService.log({
      userId: reviewerUserId,
      action: `APPLICATION_${input.decision}`,
      entity: "PropertyApplication",
      entityId: applicationId,
    });

    if (input.decision === "APPROVE") {
      const { financingService } = await import("@/lib/services/financing.service");
      await financingService.tryActivatePendingRequests(application.tenantId, application.propertyId);
    }

    return updated;
  }
}

export const applicationService = new ApplicationService();
