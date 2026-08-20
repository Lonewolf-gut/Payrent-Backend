import { prisma } from "@/lib/db/prisma";
import { financingService } from "@/lib/services/financing.service";

export type MandatePreviewStatus =
  | "awaiting_lender"
  | "awaiting_buyer"
  | "mandate_pending"
  | "bank_processing"
  | "active"
  | "declined"
  | "none";

export type MandatePreviewData = {
  financingRequestId: string;
  mandateId?: string | null;
  propertyName: string;
  borrowerName: string;
  bankName?: string | null;
  accountNumberMasked?: string | null;
  accountName?: string | null;
  bankAccountId?: string | null;
  principalAmount: number;
  interestRate?: number | null;
  durationMonths: number;
  totalRepayable?: number | null;
  monthlyPayment?: number | null;
  financingStatus: string;
  mandateStatus?: string | null;
  mandateSource?: string | null;
  documentUrl?: string | null;
  previewStatus: MandatePreviewStatus;
  buyerAcceptedAt?: string | null;
  ratePricingVisible: boolean;
};

type FinancingLike = {
  id: string;
  status: string;
  requestedAmount: number | string | { toString(): string };
  approvedAmount?: number | string | { toString(): string } | null;
  offeredInterestRate?: number | string | { toString(): string } | null;
  durationMonths: number;
  buyerAcceptedAt?: Date | string | null;
  property?: { name?: string | null } | null;
  tenant?: {
    fullName?: string | null;
    user?: { fullName?: string | null; email?: string | null } | null;
  } | null;
  feeDisclosure?: {
    principalAmount?: number | string | { toString(): string } | null;
    interestRate?: number | string | { toString(): string } | null;
    totalRepayable?: number | string | { toString(): string } | null;
    monthlyPayment?: number | string | { toString(): string } | null;
  } | null;
  mandate?: {
    id: string;
    status: string;
    mandateSource: string;
    documentUrl?: string | null;
    bankAccount?: {
      bankName?: string | null;
      accountNumberMasked?: string | null;
      accountName?: string | null;
    } | null;
  } | null;
  repaymentBankAccount?: {
    id?: string;
    bankName?: string | null;
    accountNumberMasked?: string | null;
    accountName?: string | null;
  } | null;
};

type RepaymentPreference = {
  bankAccountId?: string;
};

const ACTIVE_FINANCING_STATUSES = {
  notIn: ["REJECTED", "WITHDRAWN", "CLOSED", "COMPLETED"] as const,
};

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function buildMandatePreview(financing: FinancingLike): MandatePreviewData {
  const principalAmount =
    toNumber(financing.approvedAmount) ??
    toNumber(financing.feeDisclosure?.principalAmount) ??
    toNumber(financing.requestedAmount) ??
    0;
  const interestRate =
    toNumber(financing.offeredInterestRate) ?? toNumber(financing.feeDisclosure?.interestRate);
  const totalRepayable = financing.buyerAcceptedAt
    ? toNumber(financing.feeDisclosure?.totalRepayable)
    : null;
  const monthlyPayment = financing.buyerAcceptedAt
    ? toNumber(financing.feeDisclosure?.monthlyPayment)
    : null;
  const ratePricingVisible = Boolean(financing.buyerAcceptedAt);

  let previewStatus: MandatePreviewStatus = "awaiting_lender";
  if (financing.status === "REJECTED" || financing.status === "WITHDRAWN") {
    previewStatus = "declined";
  } else if (financing.status === "APPROVED" && !financing.buyerAcceptedAt) {
    previewStatus = "awaiting_buyer";
  } else if (financing.mandate) {
    if (financing.mandate.status === "ACTIVE") previewStatus = "active";
    else if (
      ["BANK_PROCESSING", "ADMIN_REVIEW", "PENDING_MANUAL_RESOLUTION"].includes(
        financing.mandate.status
      )
    ) {
      previewStatus = "bank_processing";
    } else if (financing.mandate.status === "DRAFT" && !financing.buyerAcceptedAt) {
      previewStatus = "awaiting_lender";
    } else {
      previewStatus = "mandate_pending";
    }
  } else if (financing.buyerAcceptedAt) {
    previewStatus = "mandate_pending";
  }

  const borrowerName =
    financing.tenant?.fullName ??
    financing.tenant?.user?.fullName ??
    financing.tenant?.user?.email ??
    "Customer";

  return {
    financingRequestId: financing.id,
    mandateId: financing.mandate?.id ?? null,
    bankAccountId:
      financing.repaymentBankAccount?.id ??
      (financing as { repaymentPreference?: { bankAccountId?: string } }).repaymentPreference
        ?.bankAccountId ??
      null,
    propertyName: financing.property?.name ?? "Listing",
    borrowerName,
    bankName:
      financing.mandate?.bankAccount?.bankName ??
      financing.repaymentBankAccount?.bankName ??
      null,
    accountNumberMasked:
      financing.mandate?.bankAccount?.accountNumberMasked ??
      financing.repaymentBankAccount?.accountNumberMasked ??
      null,
    accountName:
      financing.mandate?.bankAccount?.accountName ??
      financing.repaymentBankAccount?.accountName ??
      null,
    principalAmount,
    interestRate,
    durationMonths: financing.durationMonths,
    totalRepayable,
    monthlyPayment,
    financingStatus: financing.status,
    mandateStatus: financing.mandate?.status ?? null,
    mandateSource: financing.mandate?.mandateSource ?? null,
    documentUrl: financing.mandate?.documentUrl ?? null,
    previewStatus,
    buyerAcceptedAt: financing.buyerAcceptedAt
      ? new Date(financing.buyerAcceptedAt).toISOString()
      : null,
    ratePricingVisible,
  };
}

export async function loadMandatePreviewsForTenant(
  tenantId: string,
  userId: string,
  options?: { syncDrafts?: boolean }
) {
  if (options?.syncDrafts !== false) {
    await financingService.syncAllMandateDraftsForTenant(tenantId, userId);
  }

  const requests = await prisma.financingRequest.findMany({
    where: {
      tenantId,
      status: ACTIVE_FINANCING_STATUSES,
    },
    include: {
      property: { select: { name: true } },
      feeDisclosure: true,
      mandate: {
        include: {
          bankAccount: {
            select: {
              bankName: true,
              accountNumberMasked: true,
              accountName: true,
            },
          },
        },
      },
      tenant: {
        include: { user: { select: { fullName: true, email: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const bankAccountIds = requests
    .map((request) => (request.repaymentPreference as RepaymentPreference | null)?.bankAccountId)
    .filter((id): id is string => Boolean(id));

  const bankAccounts = bankAccountIds.length
    ? await prisma.bankAccount.findMany({
        where: { id: { in: bankAccountIds }, userId },
        select: {
          id: true,
          bankName: true,
          accountNumberMasked: true,
          accountName: true,
        },
      })
    : [];

  const bankById = new Map(bankAccounts.map((account) => [account.id, account]));

  return requests.map((request) => {
    const bankAccountId = (request.repaymentPreference as RepaymentPreference | null)?.bankAccountId;
    const repaymentBankAccount = bankAccountId ? bankById.get(bankAccountId) ?? null : null;

    return buildMandatePreview({
      ...request,
      requestedAmount: Number(request.requestedAmount),
      approvedAmount: request.approvedAmount ? Number(request.approvedAmount) : null,
      offeredInterestRate: request.offeredInterestRate
        ? Number(request.offeredInterestRate)
        : null,
      feeDisclosure: request.feeDisclosure
        ? {
            principalAmount: Number(request.feeDisclosure.principalAmount),
            interestRate: Number(request.feeDisclosure.interestRate),
            totalRepayable: Number(request.feeDisclosure.totalRepayable),
            monthlyPayment: Number(request.feeDisclosure.monthlyPayment),
          }
        : null,
      repaymentBankAccount,
    });
  });
}
