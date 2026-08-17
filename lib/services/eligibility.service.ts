import { prisma } from "@/lib/db/prisma";
import { getBusinessRules } from "@/lib/services/business-rules.service";
import type { FinancingRiskCategory } from "@prisma/client";

export type RepaymentPreference = {
  preferredPaymentDay?: number;
  preferredChannel?: "BANK_MANDATE" | "WALLET" | "MOBILE_MONEY";
  contactPhone?: string;
  contactEmail?: string;
  bankAccountId?: string;
  mandateDebitConsent?: boolean;
};

export type AffordabilitySnapshot = {
  monthlyIncome: number;
  employmentStatus?: string | null;
  creditScore?: number | null;
  estimatedMonthlyPayment: number;
  debtToIncomeRatio: number;
  factors: string[];
};

export type EligibilityResult = {
  score: number;
  riskCategory: FinancingRiskCategory;
  affordability: AffordabilitySnapshot;
  autoApproved: boolean;
};

export class EligibilityService {
  async assess(params: {
    tenantId: string;
    requestedAmount: number;
    durationMonths: number;
    monthlyIncomeOverride?: number;
    repaymentPreference?: RepaymentPreference;
  }): Promise<EligibilityResult> {
    const rules = await getBusinessRules();
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: params.tenantId },
    });

    const monthlyIncome =
      params.monthlyIncomeOverride ?? Number(tenant.monthlyIncome ?? 0);
    const estimatedMonthlyPayment =
      (params.requestedAmount / params.durationMonths) * 1.1;
    const debtToIncomeRatio =
      monthlyIncome > 0
        ? (estimatedMonthlyPayment / monthlyIncome) * 100
        : 100;

    const factors: string[] = [];
    let score = 100;

    if (monthlyIncome <= 0) {
      factors.push("No verified monthly income on file");
      score -= 40;
    }

    if (debtToIncomeRatio > rules.maxDebtToIncomePercent) {
      factors.push(
        `Estimated payment exceeds ${rules.maxDebtToIncomePercent}% of income`
      );
      score -= 35;
    } else if (debtToIncomeRatio > 35) {
      factors.push("Debt-to-income ratio is elevated");
      score -= 20;
    } else if (debtToIncomeRatio > 25) {
      factors.push("Debt-to-income ratio is moderate");
      score -= 10;
    }

    if (!tenant.kycVerified) {
      factors.push("Identity verification incomplete");
      score -= 25;
    }

    if (tenant.employmentStatus === "UNEMPLOYED") {
      factors.push("Employment status: unemployed");
      score -= 15;
    }

    if (tenant.creditScore != null) {
      if (tenant.creditScore < 500) {
        factors.push("Low credit score");
        score -= 20;
      } else if (tenant.creditScore >= 700) {
        factors.push("Strong credit score");
        score += 5;
      }
    }

    score = Math.max(0, Math.min(100, score));

    let riskCategory: FinancingRiskCategory;
    if (
      debtToIncomeRatio > rules.maxDebtToIncomePercent ||
      monthlyIncome <= 0 ||
      score < 40
    ) {
      riskCategory = "INELIGIBLE";
    } else if (debtToIncomeRatio <= 25 && score >= 75) {
      riskCategory = "LOW";
    } else if (debtToIncomeRatio <= 35 && score >= 55) {
      riskCategory = "MEDIUM";
    } else {
      riskCategory = "HIGH";
    }

    const autoApproved =
      rules.autoApproveLowRiskFinancing && riskCategory === "LOW";

    return {
      score,
      riskCategory,
      affordability: {
        monthlyIncome,
        employmentStatus: tenant.employmentStatus,
        creditScore: tenant.creditScore,
        estimatedMonthlyPayment,
        debtToIncomeRatio,
        factors,
      },
      autoApproved,
    };
  }
}

export const eligibilityService = new EligibilityService();
