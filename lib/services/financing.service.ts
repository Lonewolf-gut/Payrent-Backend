import { Prisma } from "@prisma/client";
import { prisma, runTransaction } from "@/lib/db/prisma";
import { walletService } from "@/lib/services/wallet.service";
import { notificationService } from "@/lib/services/notification.service";
import { settlementService } from "@/lib/services/settlement.service";
import { AppError } from "@/lib/errors";
import type { ApproveFinancingInput } from "@/lib/validations/financing";
import { tenantFinancingDocService } from "@/lib/services/tenant-financing-doc.service";
import { agentCommissionService } from "@/lib/services/agent-commission.service";
import { calculateAgentCommission } from "@/lib/constants/agent-commission";
import { auditService } from "@/lib/services/audit.service";
import { getBusinessRules } from "@/lib/services/business-rules.service";
import { assertLenderCanFinanceMore } from "@/lib/subscription/lender-access";
import {
  notifyAllAdminsInAppAndEmail,
  notifyComplianceEvent,
} from "@/lib/services/verification-notifications";
import {
  eligibilityService,
  type RepaymentPreference,
} from "@/lib/services/eligibility.service";
import { repaymentService } from "@/lib/services/repayment.service";
import { isDemoMode } from "@/lib/config/demo";

export class FinancingService {
  private async assertEligibility(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.kycVerified) {
      throw new AppError("Complete identity verification before requesting financing", 400);
    }

    const verifiedBank = await prisma.bankAccount.findFirst({
      where: { userId: tenant.userId, isVerified: true },
    });
    if (!verifiedBank && !isDemoMode()) {
      throw new AppError("Add and validate a bank account before requesting financing", 400);
    }

    return tenant;
  }

  private async resolveApplicationId(
    tenantId: string,
    propertyId: string,
    applicationId?: string
  ) {
    if (applicationId) {
      const application = await prisma.propertyApplication.findFirst({
        where: {
          id: applicationId,
          tenantId,
          propertyId,
          status: { notIn: ["REJECTED", "WITHDRAWN"] },
        },
      });
      if (!application) {
        throw new AppError("Property application not found for this listing", 400);
      }
      return application;
    }

    const application = await prisma.propertyApplication.findFirst({
      where: {
        tenantId,
        propertyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "CLARIFICATION_REQUIRED", "APPROVED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!application) {
      throw new AppError("Submit a property application before requesting financing", 400);
    }

    return application;
  }

  private async prerequisitesMet(tenantId: string, applicationId: string) {
    const [application, docsApproved] = await Promise.all([
      prisma.propertyApplication.findFirst({
        where: { id: applicationId, tenantId, status: "APPROVED" },
      }),
      tenantFinancingDocService.areFinancingDocsApproved(tenantId),
    ]);

    return Boolean(application && docsApproved);
  }

  async submitRequest(
    tenantId: string,
    userId: string,
    input: {
      propertyId: string;
      applicationId?: string;
      requestedAmount: number;
      durationMonths: number;
      notes?: string;
      referredAgentProfileId?: string | null;
      repaymentPreference?: RepaymentPreference;
      monthlyIncome?: number;
    }
  ) {
    await this.assertEligibility(tenantId);

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError("Customer profile required", 403);

    const bankAccountId = input.repaymentPreference?.bankAccountId;
    if (!bankAccountId) {
      throw new AppError("Select a verified bank account for repayments", 400);
    }

    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, userId: tenant.userId, isVerified: true },
    });
    if (!bankAccount) {
      throw new AppError("Add and verify a bank account before submitting a financing request", 400);
    }

    if (!input.repaymentPreference?.mandateDebitConsent) {
      throw new AppError(
        "You must consent to scheduled repayments being debited from your bank account",
        400
      );
    }

    const application = await this.resolveApplicationId(
      tenantId,
      input.propertyId,
      input.applicationId
    );

    const existing = await prisma.financingRequest.findFirst({
      where: {
        tenantId,
        propertyId: input.propertyId,
        status: { notIn: ["REJECTED", "WITHDRAWN", "CLOSED", "COMPLETED"] },
      },
    });

    if (existing && existing.status !== "CREATED") {
      throw new AppError("You already have an active Pay-for-Me request for this listing", 409);
    }

    const ready = await this.prerequisitesMet(tenantId, application.id);

    if (ready) {
      if (existing?.status === "CREATED") {
        const request = await this.activateQueuedRequest(existing.id);
        return { request, queued: false as const };
      }

      const request = await this.createRequest(
        tenantId,
        input.propertyId,
        input.requestedAmount,
        input.durationMonths,
        input.notes,
        application.id,
        input.referredAgentProfileId,
        input.repaymentPreference,
        input.monthlyIncome
      );

      return { request, queued: false as const };
    }

    const request = await this.createOrUpdateIntent(
      tenantId,
      userId,
      application.id,
      input.propertyId,
      input.requestedAmount,
      input.durationMonths,
      input.notes,
      input.referredAgentProfileId,
      input.repaymentPreference,
      input.monthlyIncome,
      existing?.id
    );

    return { request, queued: true as const };
  }

  async createOrUpdateIntent(
    tenantId: string,
    userId: string,
    applicationId: string,
    propertyId: string,
    requestedAmount: number,
    durationMonths: number,
    notes?: string,
    referredAgentProfileId?: string | null,
    repaymentPreference?: RepaymentPreference,
    monthlyIncome?: number,
    existingId?: string
  ) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { landlord: { include: { user: true } } },
    });
    if (!property || property.status !== "ACTIVE") {
      throw new AppError("Property not available", 400);
    }

    const request = existingId
      ? await prisma.financingRequest.update({
          where: { id: existingId },
          data: {
            applicationId,
            requestedAmount: new Prisma.Decimal(requestedAmount),
            durationMonths,
            notes,
            referredAgentProfileId: referredAgentProfileId ?? undefined,
            repaymentPreference: repaymentPreference as object,
            affordabilitySnapshot: monthlyIncome
              ? ({ monthlyIncomeOverride: monthlyIncome } as object)
              : undefined,
          },
          include: {
            property: true,
            tenant: { include: { user: true } },
            application: true,
          },
        })
      : await prisma.financingRequest.create({
          data: {
            tenantId,
            propertyId,
            applicationId,
            referredAgentProfileId: referredAgentProfileId ?? undefined,
            requestedAmount: new Prisma.Decimal(requestedAmount),
            durationMonths,
            notes,
            repaymentPreference: repaymentPreference as object,
            affordabilitySnapshot: monthlyIncome
              ? ({ monthlyIncomeOverride: monthlyIncome } as object)
              : undefined,
            status: "CREATED",
          },
          include: {
            property: true,
            tenant: { include: { user: true } },
            application: true,
          },
        });

    await notificationService.create({
      userId: request.tenant.userId,
      title: "Pay-for-Me request received",
      body: `Your request for ${property.name} is queued. The merchant and admin will review your application and documents next.`,
    });

    await auditService.log({
      userId,
      action: "FINANCING_REQUEST_QUEUED",
      entity: "FinancingRequest",
      entityId: request.id,
    });

    return request;
  }

  async tryActivatePendingRequests(tenantId: string, propertyId?: string) {
    const pending = await prisma.financingRequest.findMany({
      where: {
        tenantId,
        status: "CREATED",
        ...(propertyId ? { propertyId } : {}),
      },
      include: {
        tenant: { include: { user: true } },
        application: true,
      },
    });

    for (const request of pending) {
      if (!request.applicationId) continue;

      const ready = await this.prerequisitesMet(tenantId, request.applicationId);
      if (!ready) continue;

      await this.activateQueuedRequest(request.id);
    }
  }

  private async activateQueuedRequest(financingRequestId: string) {
    const request = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: {
        property: {
          include: {
            assignedAgent: { include: { user: { select: { id: true } } } },
          },
        },
        tenant: { include: { user: true } },
        application: true,
      },
    });

    if (!request || request.status !== "CREATED" || !request.applicationId) {
      throw new AppError("Queued financing request not found", 404);
    }

    const ready = await this.prerequisitesMet(request.tenantId, request.applicationId);
    if (!ready) {
      throw new AppError("Application and financing documents must be approved first", 400);
    }

    const snapshot = request.affordabilitySnapshot as { monthlyIncomeOverride?: number } | null;
    const repaymentPreference = request.repaymentPreference as RepaymentPreference | null;

    const assessment = await eligibilityService.assess({
      tenantId: request.tenantId,
      requestedAmount: Number(request.requestedAmount),
      durationMonths: request.durationMonths,
      monthlyIncomeOverride: snapshot?.monthlyIncomeOverride,
      repaymentPreference: repaymentPreference ?? undefined,
    });

    if (assessment.riskCategory === "INELIGIBLE") {
      throw new AppError(
        "You do not meet the initial affordability requirements for this financing amount. Try a lower amount or longer repayment period.",
        400
      );
    }

    const initialStatus = assessment.autoApproved ? "MANDATE_PENDING" : "ELIGIBILITY_PENDING";

    const updated = await prisma.financingRequest.update({
      where: { id: request.id },
      data: {
        status: initialStatus,
        riskCategory: assessment.riskCategory,
        eligibilityScore: assessment.score,
        affordabilitySnapshot: assessment.affordability as object,
      },
      include: {
        property: {
          include: {
            assignedAgent: { include: { user: { select: { id: true } } } },
          },
        },
        tenant: { include: { user: true } },
        application: true,
      },
    });

    if (!assessment.autoApproved) {
      await prisma.adminReviewRecord.create({
        data: {
          reviewType: "FINANCING_REQUEST",
          relatedEntityType: "FinancingRequest",
          relatedEntityId: updated.id,
          status: "PENDING",
        },
      });

      await notifyAllAdminsInAppAndEmail(
        "Financing request pending eligibility review",
        `Customer ${updated.tenant.user.email} requested GHS ${Number(updated.requestedAmount).toLocaleString()} financing for "${updated.property.name}" (${assessment.riskCategory} risk).`
      );
    }

    const notifyAgentId =
      updated.referredAgentProfileId &&
      (await prisma.agentProfile.findUnique({
        where: { id: updated.referredAgentProfileId },
        select: { userId: true },
      }));

    if (notifyAgentId) {
      await notificationService.create({
        userId: notifyAgentId.userId,
        title: "Financing request from your promotion",
        body: `A Customer requested financing for ${updated.property.name} through your referral.`,
        metadata: { propertyId: updated.propertyId, financingRequestId: updated.id },
      });
    }

    await notificationService.create({
      userId: updated.tenant.userId,
      title: "Pay-for-Me request activated",
      body: `Your request for ${updated.property.name} is now with the admin for eligibility review.`,
    });

    await auditService.log({
      userId: updated.tenant.userId,
      action: "FINANCING_REQUEST_ACTIVATED",
      entity: "FinancingRequest",
      entityId: updated.id,
      metadata: {
        riskCategory: assessment.riskCategory,
        eligibilityScore: assessment.score,
        autoApproved: assessment.autoApproved,
      },
    });

    return updated;
  }

  async createRequest(
    tenantId: string,
    propertyId: string,
    requestedAmount: number,
    durationMonths: number,
    notes?: string,
    applicationId?: string,
    referredAgentProfileId?: string | null,
    repaymentPreference?: RepaymentPreference,
    monthlyIncome?: number
  ) {
    await this.assertEligibility(tenantId);
    await tenantFinancingDocService.assertFinancingDocsApproved(tenantId);

    if (!applicationId) {
      throw new AppError("An approved property application is required", 400);
    }

    const application = await prisma.propertyApplication.findFirst({
      where: { id: applicationId, tenantId, status: "APPROVED" },
    });
    if (!application) {
      throw new AppError("An approved property application is required", 400);
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property || property.status !== "ACTIVE") {
      throw new AppError("Property not available", 400);
    }

    const assessment = await eligibilityService.assess({
      tenantId,
      requestedAmount,
      durationMonths,
      monthlyIncomeOverride: monthlyIncome,
      repaymentPreference,
    });

    if (assessment.riskCategory === "INELIGIBLE") {
      throw new AppError(
        "You do not meet the initial affordability requirements for this financing amount. Try a lower amount or longer repayment period.",
        400
      );
    }

    const agentAttribution =
      referredAgentProfileId ?? application.referredAgentProfileId ?? undefined;

    const initialStatus = assessment.autoApproved ? "MANDATE_PENDING" : "ELIGIBILITY_PENDING";

    const request = await prisma.financingRequest.create({
      data: {
        tenantId,
        propertyId,
        applicationId,
        referredAgentProfileId: agentAttribution,
        requestedAmount: new Prisma.Decimal(requestedAmount),
        durationMonths,
        notes,
        repaymentPreference: repaymentPreference as object,
        affordabilitySnapshot: assessment.affordability as object,
        riskCategory: assessment.riskCategory,
        eligibilityScore: assessment.score,
        status: initialStatus,
      },
      include: {
        property: {
          include: {
            assignedAgent: { include: { user: { select: { id: true } } } },
          },
        },
        tenant: { include: { user: true } },
        application: true,
      },
    });

    if (!assessment.autoApproved) {
      await prisma.adminReviewRecord.create({
        data: {
          reviewType: "FINANCING_REQUEST",
          relatedEntityType: "FinancingRequest",
          relatedEntityId: request.id,
          status: "PENDING",
        },
      });

      await notifyAllAdminsInAppAndEmail(
        "Financing request pending eligibility review",
        `Customer ${request.tenant.user.email} requested GHS ${requestedAmount.toLocaleString()} financing for "${request.property.name}" (${assessment.riskCategory} risk).`
      );
    }

    const notifyAgentId =
      agentAttribution &&
      (await prisma.agentProfile.findUnique({
        where: { id: agentAttribution },
        select: { userId: true },
      }));

    if (notifyAgentId) {
      await notificationService.create({
        userId: notifyAgentId.userId,
        title: "Financing request from your promotion",
        body: `A Customer requested financing for ${request.property.name} through your referral.`,
        metadata: { propertyId, financingRequestId: request.id },
      });
    }

    await auditService.log({
      userId: request.tenant.userId,
      action: "FINANCING_REQUEST_CREATED",
      entity: "FinancingRequest",
      entityId: request.id,
      metadata: {
        riskCategory: assessment.riskCategory,
        eligibilityScore: assessment.score,
        autoApproved: assessment.autoApproved,
      },
    });

    return request;
  }

  async adminReviewRequest(
    financingRequestId: string,
    adminUserId: string,
    decision: "APPROVE" | "REJECT",
    decisionNote?: string
  ) {
    const request = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: { tenant: { include: { user: true } }, property: true },
    });

    if (!request || request.status !== "ELIGIBILITY_PENDING") {
      throw new AppError("Financing request not found or not pending eligibility review", 404);
    }

    if (decision === "REJECT") {
      const updated = await runTransaction(async (db) => {
        await db.adminReviewRecord.updateMany({
          where: {
            relatedEntityType: "FinancingRequest",
            relatedEntityId: financingRequestId,
            status: "PENDING",
          },
          data: {
            status: "REJECTED",
            assignedAdminUserId: adminUserId,
            decision: "REJECT",
            decisionNote,
            completedAt: new Date(),
          },
        });

        return db.financingRequest.update({
          where: { id: financingRequestId },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
            decisionReason: decisionNote,
            adminReviewedAt: new Date(),
            adminReviewedByUserId: adminUserId,
          },
        });
      });

      await notificationService.create({
        userId: request.tenant.userId,
        title: "Financing request not approved",
        body:
          decisionNote ??
          `Your financing request for ${request.property.name} did not pass eligibility review.`,
      });

      return updated;
    }

    const updated = await runTransaction(async (db) => {
      await db.adminReviewRecord.updateMany({
        where: {
          relatedEntityType: "FinancingRequest",
          relatedEntityId: financingRequestId,
          status: "PENDING",
        },
        data: {
          status: "APPROVED",
          assignedAdminUserId: adminUserId,
          decision: "APPROVE",
          decisionNote,
          completedAt: new Date(),
        },
      });

      return db.financingRequest.update({
        where: { id: financingRequestId },
        data: {
          status: "MANDATE_PENDING",
          adminReviewedAt: new Date(),
          adminReviewedByUserId: adminUserId,
        },
      });
    });

    await notificationService.create({
      userId: request.tenant.userId,
      title: "Financing request approved for mandate setup",
      body: `Your financing request for ${request.property.name} passed eligibility review. Set up your repayment mandate to continue.`,
    });

    await auditService.log({
      userId: adminUserId,
      action: "FINANCING_ELIGIBILITY_APPROVED",
      entity: "FinancingRequest",
      entityId: financingRequestId,
    });

    return updated;
  }

  async approveRequest(lenderId: string, input: ApproveFinancingInput) {
    await assertLenderCanFinanceMore(lenderId, (await prisma.lender.findUniqueOrThrow({
      where: { id: lenderId },
      select: { userId: true },
    })).userId);

    const rules = await getBusinessRules();
    if (input.interestRate > rules.maxInterestRatePercent) {
      throw new AppError(
        `Interest rate cannot exceed ${rules.maxInterestRatePercent}%`,
        400
      );
    }

    const request = await prisma.financingRequest.findUnique({
      where: { id: input.financingRequestId },
      include: {
        tenant: { include: { user: true } },
        property: {
          include: {
            landlord: { include: { user: true } },
            assignedAgent: { include: { user: true } },
          },
        },
        mandate: true,
      },
    });

    if (
      !request ||
      !["PENDING", "UNDER_REVIEW", "READY_FOR_LENDER_REVIEW"].includes(request.status)
    ) {
      throw new AppError("Financing request not found or already processed");
    }

    if (!request.mandate || request.mandate.status !== "ACTIVE") {
      throw new AppError("An active repayment mandate is required before approval", 400);
    }

    if (
      request.durationMonths < rules.minRepaymentMonths ||
      request.durationMonths > rules.maxRepaymentMonths
    ) {
      throw new AppError(
        `Repayment period must be between ${rules.minRepaymentMonths} and ${rules.maxRepaymentMonths} months`,
        400
      );
    }

    const lender = await prisma.lender.findUnique({
      where: { id: lenderId },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!lender?.user) throw new AppError("Lender not found");

    const lenderBalance = await walletService.getBalance(lender.userId, "LENDER");
    if (Number(lenderBalance.balance) < input.amount) {
      throw new AppError("Insufficient lender wallet balance");
    }

    const totalWithInterest = input.amount * (1 + input.interestRate / 100);
    const monthlyPayment = totalWithInterest / request.durationMonths;
    const platformFee = input.amount * (rules.platformFinancingFeePercent / 100);

    const commissionAgent = await agentCommissionService.resolveCommissionAgent(
      request.propertyId,
      request.referredAgentProfileId
    );
    const agentCommission = commissionAgent
      ? calculateAgentCommission(input.amount)
      : 0;

    const updated = await prisma.financingRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        approvedAmount: new Prisma.Decimal(input.amount),
        approvedAt: new Date(),
        offeredInterestRate: new Prisma.Decimal(input.interestRate),
        offeredPlanType: input.planType,
      },
    });

    await prisma.feeDisclosureRecord.create({
      data: {
        financingRequestId: request.id,
        tenantUserId: request.tenant.userId,
        lenderUserId: lender.user.id,
        principalAmount: new Prisma.Decimal(input.amount),
        interestRate: new Prisma.Decimal(input.interestRate),
        totalRepayable: new Prisma.Decimal(totalWithInterest),
        platformFee: new Prisma.Decimal(platformFee),
        agentCommission: new Prisma.Decimal(agentCommission),
        durationMonths: request.durationMonths,
        monthlyPayment: new Prisma.Decimal(monthlyPayment),
        acceptedByUserId: lender.user.id,
        metadata: {
          planType: input.planType,
          propertyId: request.propertyId,
          propertyName: request.property.name,
          customSchedule: input.customSchedule,
          awaitingBuyerAcceptance: true,
        },
      },
    });

    await auditService.log({
      userId: lender.user.id,
      action: "FINANCING_APPROVED",
      entity: "FinancingRequest",
      entityId: request.id,
      metadata: {
        amount: input.amount,
        interestRate: input.interestRate,
        durationMonths: request.durationMonths,
        tenantUserId: request.tenant.userId,
      },
    });

    await notifyComplianceEvent(
      "Fee disclosure recorded",
      `Financing approved for ${request.tenant.user.email} on "${request.property.name}" — GHS ${input.amount.toLocaleString()} at ${input.interestRate}% for ${request.durationMonths} months.`,
      { financingRequestId: request.id, lenderUserId: lender.user.id }
    );

    await notificationService.create({
      userId: request.tenant.userId,
      title: "Financing terms offered",
      body: `A lender has approved financing for ${request.property.name}. Review and accept the terms to proceed.`,
      metadata: { financingRequestId: request.id },
    });

    await notificationService.create({
      userId: lender.user.id,
      title: "Financing offer sent",
      body: `Your financing offer for ${request.property.name} is awaiting customer acceptance.`,
    });

    return updated;
  }

  async acceptBuyerTerms(tenantUserId: string, financingRequestId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { userId: tenantUserId } });
    if (!tenant) throw new AppError("Customer profile required", 403);

    const request = await prisma.financingRequest.findFirst({
      where: { id: financingRequestId, tenantId: tenant.id, status: "APPROVED" },
      include: {
        tenant: { include: { user: true } },
        property: {
          include: {
            landlord: { include: { user: true } },
            assignedAgent: { include: { user: true } },
          },
        },
        feeDisclosure: true,
      },
    });

    if (!request?.approvedAmount || request.offeredInterestRate == null) {
      throw new AppError("Financing offer not found or incomplete", 404);
    }

    const amount = Number(request.approvedAmount);

    const lenderUserId = request.feeDisclosure?.lenderUserId;
    if (!lenderUserId) {
      throw new AppError("Lender not found for this financing offer", 404);
    }

    const lender = await prisma.lender.findUnique({ where: { userId: lenderUserId } });
    if (!lender) {
      throw new AppError("Lender not found for this financing offer", 404);
    }
    const lenderId = lender.id;

    const rules = await getBusinessRules();
    const commissionAgent = await agentCommissionService.resolveCommissionAgent(
      request.propertyId,
      request.referredAgentProfileId
    );
    const agentCommission = commissionAgent
      ? calculateAgentCommission(amount)
      : 0;
    const landlordUserId = request.property.landlord.userId;
    const landlordNet = amount - agentCommission;
    const reference = `FIN-${financingRequestId.slice(0, 8).toUpperCase()}`;

    await walletService.transfer(
      lenderUserId,
      "LENDER",
      landlordUserId,
      "MERCHANT",
      landlordNet,
      `Financing disbursement for ${request.property.name}`
    );

    if (commissionAgent && agentCommission > 0) {
      await walletService.transfer(
        landlordUserId,
        "MERCHANT",
        commissionAgent.user.id,
        "MARKETER",
        agentCommission,
        `Agent commission for financing: ${request.property.name}`
      );
    }

    const result = await runTransaction(async (db) => {
      await db.investment.create({
        data: {
          lenderId,
          financingRequestId: request.id,
          amount: new Prisma.Decimal(amount),
          interestRate: new Prisma.Decimal(interestRate),
        },
      });

      const updated = await db.financingRequest.update({
        where: { id: request.id },
        data: {
          status: "DISBURSED",
          buyerAcceptedAt: new Date(),
          disbursedAt: new Date(),
        },
      });

      if (request.feeDisclosure) {
        await db.feeDisclosureRecord.update({
          where: { id: request.feeDisclosure.id },
          data: {
            metadata: {
              ...(request.feeDisclosure.metadata as object),
              buyerAcceptedAt: new Date().toISOString(),
              awaitingBuyerAcceptance: false,
            },
          },
        });
      }

      return updated;
    });

    if (commissionAgent && agentCommission > 0) {
      await prisma.agentEarning.create({
        data: {
          agentProfileId: commissionAgent.id,
          propertyId: request.propertyId,
          type: "FINANCING",
          amount: new Prisma.Decimal(agentCommission),
          grossAmount: new Prisma.Decimal(amount),
          commissionRate: new Prisma.Decimal(rules.agentCommissionPercent),
          reference,
          financingRequestId: request.id,
        },
      });

      await notificationService.create({
        userId: commissionAgent.user.id,
        title: "Financing commission earned",
        body: `You earned GHS ${agentCommission.toLocaleString()} commission on financing for "${request.property.name}".`,
        metadata: {
          propertyId: request.propertyId,
          financingRequestId: request.id,
          commission: agentCommission,
        },
      });
    }

    await settlementService.createFromFinancing(request.id, lenderUserId);

    await notificationService.create({
      userId: landlordUserId,
      title: "Financing disbursed",
      body: `Pay-for-me financing for ${request.property.name} has been disbursed to your wallet. Confirm delivery when the customer receives the product.`,
      metadata: { financingRequestId: request.id },
    });

    await notificationService.create({
      userId: lenderUserId,
      title: "Customer accepted financing terms",
      body: `The customer accepted your financing offer for ${request.property.name}. Payment has been disbursed to the merchant.`,
    });

    await auditService.log({
      userId: tenantUserId,
      action: "FINANCING_TERMS_ACCEPTED",
      entity: "FinancingRequest",
      entityId: request.id,
    });

    return result;
  }

  async confirmDelivery(merchantUserId: string, financingRequestId: string) {
    const landlord = await prisma.landlord.findUnique({ where: { userId: merchantUserId } });
    if (!landlord) throw new AppError("Merchant profile required", 403);

    const request = await prisma.financingRequest.findFirst({
      where: {
        id: financingRequestId,
        status: "DISBURSED",
        property: { landlordId: landlord.id },
      },
      include: {
        tenant: { include: { user: true } },
        property: true,
        investment: true,
        feeDisclosure: true,
      },
    });

    if (!request?.approvedAmount || request.offeredInterestRate == null) {
      throw new AppError("Financing request not ready for delivery confirmation", 404);
    }

    const existingPlan = await prisma.repaymentPlan.findUnique({
      where: { financingId: request.id },
    });
    if (existingPlan) {
      throw new AppError("Repayment schedule is already active", 400);
    }

    const amount = Number(request.approvedAmount);
    const interestRate = Number(request.offeredInterestRate);
    const planType = request.offeredPlanType ?? "MONTHLY";
    const totalWithInterest = amount * (1 + interestRate / 100);
    const monthlyPayment = totalWithInterest / request.durationMonths;

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + request.durationMonths);

    const customSchedule = (
      request.feeDisclosure?.metadata as { customSchedule?: { amount: number; dueDate: string }[] }
    )?.customSchedule;

    await runTransaction(async (db) => {
      const repaymentPlan = await db.repaymentPlan.create({
        data: {
          financingId: request.id,
          planType,
          totalAmount: new Prisma.Decimal(totalWithInterest),
          interestRate: new Prisma.Decimal(interestRate),
          startDate,
          endDate,
        },
      });

      const installments =
        customSchedule ??
        Array.from({ length: request.durationMonths }, (_, i) => {
          const dueDate = new Date(startDate);
          dueDate.setMonth(dueDate.getMonth() + i + 1);
          return { amount: monthlyPayment, dueDate: dueDate.toISOString() };
        });

      await db.installment.createMany({
        data: installments.map((inst, index) => ({
          repaymentPlanId: repaymentPlan.id,
          instalmentNumber: index + 1,
          amount: new Prisma.Decimal(inst.amount),
          dueDate: new Date(inst.dueDate),
          status: "PENDING" as const,
        })),
      });

      await db.financingRequest.update({
        where: { id: request.id },
        data: {
          status: "REPAYMENT_ACTIVE",
          deliveryStatus: "DELIVERED",
          deliveredAt: new Date(),
        },
      });

      await db.property.update({
        where: { id: request.propertyId },
        data: { status: "RENTED" },
      });
    });

    await notificationService.create({
      userId: request.tenant.userId,
      title: "Product delivered — repayments active",
      body: `Delivery confirmed for ${request.property.name}. Your repayment schedule is now active.`,
      metadata: { financingRequestId: request.id },
    });

    const lenderUserId = (
      await prisma.investment.findUnique({
        where: { financingRequestId: request.id },
        include: { lender: { include: { user: true } } },
      })
    )?.lender?.user?.id;

    if (lenderUserId) {
      await notificationService.create({
        userId: lenderUserId,
        title: "Repayment schedule started",
        body: `Delivery confirmed for ${request.property.name}. Repayments are now active.`,
      });
    }

    await auditService.log({
      userId: merchantUserId,
      action: "FINANCING_DELIVERY_CONFIRMED",
      entity: "FinancingRequest",
      entityId: request.id,
    });

    return prisma.financingRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { repaymentPlan: { include: { installments: true } } },
    });
  }

  async rejectRequest(financingRequestId: string, lenderUserId: string) {
    const request = await prisma.financingRequest.update({
      where: {
        id: financingRequestId,
        status: { in: ["PENDING", "UNDER_REVIEW", "READY_FOR_LENDER_REVIEW"] },
      },
      data: { status: "REJECTED", rejectedAt: new Date() },
      include: { tenant: { include: { user: true } }, property: true },
    });

    await notificationService.create({
      userId: request.tenant.userId,
      title: "Financing declined",
      body: `Your financing request for ${request.property.name} was not approved.`,
    });

    await auditService.log({
      userId: lenderUserId,
      action: "FINANCING_REJECTED",
      entity: "FinancingRequest",
      entityId: financingRequestId,
      metadata: {
        tenantUserId: request.tenant.userId,
        propertyId: request.propertyId,
      },
    });

    return request;
  }

  async payInstallment(tenantUserId: string, installmentId: string) {
    const installment = await prisma.installment.findUnique({
      where: { id: installmentId },
      include: {
        repaymentPlan: {
          include: {
            financing: {
              include: {
                investment: { include: { lender: { include: { user: true } } } },
                tenant: true,
                mandate: true,
              },
            },
          },
        },
      },
    });

    if (!installment || installment.status === "PAID") {
      throw new AppError("Installment not found or already paid");
    }

    const financing = installment.repaymentPlan.financing;
    if (financing.tenant.userId !== tenantUserId) {
      throw new AppError("Unauthorized", 403);
    }

    if (financing.mandate?.status === "ACTIVE") {
      const { mandateExecutionService } = await import(
        "@/lib/services/mandate-execution.service"
      );
      const result = await mandateExecutionService.executeDeduction(
        installmentId,
        financing.mandate.id
      );
      if (result.status === "SUCCESSFUL") {
        return prisma.installment.findUniqueOrThrow({ where: { id: installmentId } });
      }
      throw new AppError(result.failureReason ?? "Mandate deduction failed", 400);
    }

    const amountDue = Number(installment.amount) - Number(installment.amountPaid);
    const lenderUserId = financing.investment?.lender?.user?.id;
    if (!lenderUserId) throw new AppError("Lender not found");

    await walletService.transfer(
      tenantUserId,
      "BUYER",
      lenderUserId,
      "LENDER",
      amountDue,
      "Installment payment"
    );

    return repaymentService.recordInstallmentPayment({
      installmentId,
      amountPaid: amountDue,
      source: "wallet",
    });
  }

  async getLenderPortfolio(lenderId: string) {
    return prisma.financingRequest.findMany({
      where: {
        status: {
          in: ["DISBURSED", "REPAYMENT_ACTIVE", "FUNDED", "CLOSED", "DEFAULTED", "APPROVED"],
        },
        investment: { lenderId },
      },
      include: {
        property: true,
        mandate: true,
        investment: true,
        repaymentPlan: { include: { installments: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getPendingForLender(lenderUserId?: string) {
    const requests = await prisma.financingRequest.findMany({
      where: { status: { in: ["PENDING", "UNDER_REVIEW", "READY_FOR_LENDER_REVIEW"] } },
      include: {
        tenant: {
          include: {
            user: { select: { email: true, image: true } },
          },
        },
        property: { include: { images: { take: 1 } } },
        mandate: true,
        application: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!lenderUserId) return requests;

    const { getLenderFinancingAccess } = await import(
      "@/lib/subscription/lender-access"
    );
    const access = await getLenderFinancingAccess(lenderUserId);
    if (access.limit == null) return requests;

    return requests.slice(0, access.limit);
  }

  async getPendingAdminReview() {
    return prisma.financingRequest.findMany({
      where: { status: "ELIGIBILITY_PENDING" },
      include: {
        tenant: { include: { user: { select: { email: true } } } },
        property: { select: { id: true, name: true, location: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getPendingMerchantDelivery(merchantUserId: string) {
    const landlord = await prisma.landlord.findUnique({ where: { userId: merchantUserId } });
    if (!landlord) return [];

    return prisma.financingRequest.findMany({
      where: {
        status: "DISBURSED",
        deliveryStatus: "PENDING",
        property: { landlordId: landlord.id },
      },
      include: {
        tenant: { include: { user: { select: { email: true, phone: true } } } },
        property: { select: { name: true } },
      },
      orderBy: { disbursedAt: "desc" },
    });
  }
}

export const financingService = new FinancingService();
