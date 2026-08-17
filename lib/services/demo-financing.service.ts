import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { isDemoMode } from "@/lib/config/demo";
import { financingService } from "@/lib/services/financing.service";
import { mandateService } from "@/lib/services/mandate.service";
import { getBusinessRules } from "@/lib/services/business-rules.service";
import { FINANCING_STATUS_LABELS } from "@/constants/platform";

const DEMO_LENDER_EMAIL = "lender@payforme.com";
const DEMO_MERCHANT_EMAIL = "landlord@payforme.com";

export type DemoFinancingStep = {
  from: string;
  to: string;
  action: string;
};

export type DemoFinancingAdvanceResult = {
  financingRequestId: string;
  previousStatus: string;
  currentStatus: string;
  steps: DemoFinancingStep[];
  repaymentPlanActive: boolean;
  installmentCount?: number;
};

export class DemoFinancingService {
  private assertDemoEnabled() {
    if (!isDemoMode()) {
      throw new AppError(
        "Demo financing walkthrough is only available when DEMO_MODE=true or PAYMENT_PROVIDER=demo",
        403,
        "DEMO_MODE_DISABLED"
      );
    }
  }

  async getWalkthroughState(financingRequestId: string) {
    const request = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: {
        property: { select: { name: true } },
        tenant: { include: { user: { select: { email: true } } } },
        mandate: true,
        investment: true,
        repaymentPlan: { include: { installments: true } },
      },
    });

    if (!request) throw new AppError("Financing request not found", 404);

    return {
      id: request.id,
      status: request.status,
      statusLabel: FINANCING_STATUS_LABELS[request.status] ?? request.status,
      propertyName: request.property.name,
      buyerEmail: request.tenant.user.email,
      requestedAmount: Number(request.requestedAmount),
      durationMonths: request.durationMonths,
      mandateStatus: request.mandate?.status ?? null,
      hasRepaymentPlan: Boolean(request.repaymentPlan),
      installmentCount: request.repaymentPlan?.installments.length ?? 0,
      nextAction: this.describeNextAction(request.status, request.mandate?.status ?? null),
    };
  }

  private describeNextAction(status: string, mandateStatus: string | null) {
    switch (status) {
      case "ELIGIBILITY_PENDING":
        return "Admin approves eligibility";
      case "MANDATE_PENDING":
        return "Demo stops here — bank mandate would be sent next";
      case "READY_FOR_LENDER_REVIEW":
      case "PENDING":
      case "UNDER_REVIEW":
        return "Demo lender approves financing offer";
      case "APPROVED":
        return "Buyer accepts financing terms";
      case "DISBURSED":
        return "Merchant confirms delivery — repayment schedule starts";
      case "REPAYMENT_ACTIVE":
        return "Repayment schedule is active";
      default:
        return "No further demo steps";
    }
  }

  async advanceOneStep(
    financingRequestId: string,
    adminUserId: string
  ): Promise<DemoFinancingAdvanceResult> {
    this.assertDemoEnabled();

    const request = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: {
        tenant: { include: { user: true } },
        property: { include: { landlord: { include: { user: true } } } },
        mandate: true,
        repaymentPlan: true,
      },
    });

    if (!request) throw new AppError("Financing request not found", 404);

    const steps: DemoFinancingStep[] = [];
    const previousStatus = request.status;

    if (request.status === "CREATED") {
      throw new AppError(
        "Waiting for merchant application approval and admin financing document review.",
        400
      );
    }

    if (request.status === "ELIGIBILITY_PENDING") {
      await financingService.adminReviewRequest(financingRequestId, adminUserId, "APPROVE");
      steps.push({
        from: "ELIGIBILITY_PENDING",
        to: "MANDATE_PENDING",
        action: "Admin approved eligibility",
      });
    } else if (request.status === "MANDATE_PENDING") {
      throw new AppError(
        "Demo walkthrough stops before sending the repayment mandate to the bank.",
        400,
        "DEMO_STOPS_BEFORE_BANK"
      );
    } else if (
      ["READY_FOR_LENDER_REVIEW", "PENDING", "UNDER_REVIEW"].includes(request.status)
    ) {
      await this.approveWithDemoLender(request.id, steps);
    } else if (request.status === "APPROVED") {
      await financingService.acceptBuyerTerms(request.tenant.userId, request.id);
      steps.push({
        from: "APPROVED",
        to: "DISBURSED",
        action: "Buyer accepted lender offer — funds disbursed to merchant",
      });
    } else if (request.status === "DISBURSED") {
      await financingService.confirmDelivery(
        request.property.landlord.userId,
        request.id
      );
      steps.push({
        from: "DISBURSED",
        to: "REPAYMENT_ACTIVE",
        action: "Merchant confirmed delivery — repayment schedule activated",
      });
    } else if (request.status === "REPAYMENT_ACTIVE") {
      throw new AppError("Financing demo flow is already complete", 400);
    } else {
      throw new AppError(`Cannot advance financing in status ${request.status}`, 400);
    }

    const updated = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: { repaymentPlan: { include: { installments: true } } },
    });

    return {
      financingRequestId,
      previousStatus,
      currentStatus: updated?.status ?? previousStatus,
      steps,
      repaymentPlanActive: updated?.status === "REPAYMENT_ACTIVE",
      installmentCount: updated?.repaymentPlan?.installments.length,
    };
  }

  async runFullWalkthrough(
    financingRequestId: string,
    adminUserId: string
  ): Promise<DemoFinancingAdvanceResult> {
    this.assertDemoEnabled();

    const allSteps: DemoFinancingStep[] = [];
    let lastResult: DemoFinancingAdvanceResult | null = null;
    const maxIterations = 8;

    for (let i = 0; i < maxIterations; i++) {
      const state = await this.getWalkthroughState(financingRequestId);
      if (state.status === "MANDATE_PENDING") break;
      if (state.status === "REPAYMENT_ACTIVE") break;
      if (state.status === "REJECTED") {
        throw new AppError("Financing request was rejected — create a new request", 400);
      }

      lastResult = await this.advanceOneStep(financingRequestId, adminUserId);
      allSteps.push(...lastResult.steps);

      if (lastResult.currentStatus === "MANDATE_PENDING") break;
      if (lastResult.currentStatus === "REPAYMENT_ACTIVE") break;
    }

    if (!lastResult) {
      throw new AppError("Financing request cannot be advanced", 400);
    }

    return { ...lastResult, steps: allSteps };
  }

  private async ensureActiveMandate(
    request: {
      id: string;
      tenantId: string;
      mandate: { id: string; status: string } | null;
      tenant: { userId: string };
    },
    adminUserId: string,
    steps: DemoFinancingStep[]
  ) {
    let mandate = request.mandate;

    if (!mandate) {
      const bankAccount = await prisma.bankAccount.findFirst({
        where: { userId: request.tenant.userId, isVerified: true },
        orderBy: { createdAt: "asc" },
      });

      if (!bankAccount) {
        throw new AppError(
          "Demo buyer needs a verified bank or MoMo account. Log in as tenant@payforme.com and add one in Settings, or re-run db:seed.",
          400
        );
      }

      mandate = await mandateService.create(request.tenantId, request.tenant.userId, {
        financingRequestId: request.id,
        bankAccountId: bankAccount.id,
        mandateType: "DIRECT_DEBIT",
        mandateSource: "PLATFORM_GENERATED",
      });

      steps.push({
        from: "MANDATE_PENDING",
        to: mandate.status,
        action: "Created platform-generated repayment mandate",
      });
    }

    if (mandate.status === "BANK_PROCESSING") {
      await mandateService.syncBankStatus(mandate.id, adminUserId);
      steps.push({
        from: "BANK_PROCESSING",
        to: "ACTIVE",
        action: "Sandbox bank activated mandate",
      });
      return;
    }

    if (["ADMIN_REVIEW", "PENDING_MANUAL_RESOLUTION"].includes(mandate.status)) {
      await mandateService.review(mandate.id, adminUserId, { decision: "APPROVE" });
      steps.push({
        from: mandate.status,
        to: "ACTIVE",
        action: "Admin approved mandate",
      });
    }
  }

  private async approveWithDemoLender(financingRequestId: string, steps: DemoFinancingStep[]) {
    const lenderUser = await prisma.user.findUnique({
      where: { email: DEMO_LENDER_EMAIL },
      include: { lender: true },
    });

    if (!lenderUser?.lender) {
      throw new AppError(`Demo lender account (${DEMO_LENDER_EMAIL}) not found — run db:seed`, 500);
    }

    const request = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
    });

    if (!request) throw new AppError("Financing request not found", 404);

    const rules = await getBusinessRules();
    const amount = Number(request.requestedAmount);
    const interestRate = Math.min(18, rules.maxInterestRatePercent);

    await financingService.approveRequest(lenderUser.lender.id, {
      financingRequestId,
      amount,
      interestRate,
      planType: "MONTHLY",
    });

    steps.push({
      from: request.status,
      to: "APPROVED",
      action: `Demo lender (${DEMO_LENDER_EMAIL}) sent financing offer`,
    });
  }
}

export const demoFinancingService = new DemoFinancingService();

export { DEMO_LENDER_EMAIL, DEMO_MERCHANT_EMAIL };
