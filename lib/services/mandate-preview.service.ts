import { prisma } from "@/lib/db/prisma";
import { buildMandatePreview } from "@/lib/utils/mandate-preview";
import { financingService } from "@/lib/services/financing.service";

type RepaymentPreference = {
  bankAccountId?: string;
};

const ACTIVE_FINANCING_STATUSES = {
  notIn: ["REJECTED", "WITHDRAWN", "CLOSED", "COMPLETED"] as const,
};

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
