import { NextRequest } from "next/server";
import { financingRequestSchema } from "@/lib/validations/financing";
import { financingService } from "@/lib/services/financing.service";
import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { getReferralAgentProfileId } from "@/lib/utils/agent-referral-request";
import { consentService } from "@/lib/services/consent.service";
import { getBusinessRules } from "@/lib/services/business-rules.service";
export const GET = withAuth(
  async (req: NextRequest, _ctx, session) => {
    if (session.user.role === "LENDER") {
      const lender = await prisma.lender.findUnique({
        where: { userId: session.user.id },
      });
      if (!lender) return apiResponse([]);

      const scope = req.nextUrl.searchParams.get("scope");
      if (scope === "portfolio") {
        const portfolio = await financingService.getLenderPortfolio(lender.id);
        return apiResponse(portfolio);
      }

      const requests = await financingService.getPendingForLender(session.user.id);
      return apiResponse(requests);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { userId: session.user.id },
    });
    if (!tenant) return apiResponse([]);

    const requests = await prisma.financingRequest.findMany({
      where: { tenantId: tenant.id },
      include: {
        property: { include: { images: { take: 1 } } },
        feeDisclosure: true,
        mandate: {
          select: {
            id: true,
            status: true,
            mandateSource: true,
            documentUrl: true,
          },
        },
        tenant: {
          include: { user: { select: { fullName: true, email: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return apiResponse(requests);
  },
  { roles: ["BUYER", "LENDER"] }
);

export const POST = withAuth(
  async (req: NextRequest, _ctx, session) => {
    const body = await req.json();
    const parsed = financingRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiResponse({ error: parsed.error.flatten() }, 400);
    }

    const rules = await getBusinessRules();
    if (
      parsed.data.durationMonths < rules.minRepaymentMonths ||
      parsed.data.durationMonths > rules.maxRepaymentMonths
    ) {
      return apiResponse(
        {
          error: `Repayment period must be between ${rules.minRepaymentMonths} and ${rules.maxRepaymentMonths} months`,
        },
        400
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { userId: session.user.id },
    });
    if (!tenant) return apiResponse({ error: "Customer profile required" }, 403);

    const referredAgentProfileId = await getReferralAgentProfileId(req);

    const { request, queued } = await financingService.submitRequest(tenant.id, session.user.id, {
      propertyId: parsed.data.propertyId,
      applicationId: parsed.data.applicationId,
      requestedAmount: parsed.data.requestedAmount,
      durationMonths: parsed.data.durationMonths,
      notes: parsed.data.notes,
      referredAgentProfileId,
      repaymentPreference: parsed.data.repaymentPreference,
      monthlyIncome: parsed.data.monthlyIncome,
    });

    await consentService.recordFinancingConsent(session.user.id, request.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
      metadata: {
        propertyId: parsed.data.propertyId,
        requestedAmount: parsed.data.requestedAmount,
        queued,
      },
    });

    return apiResponse({ ...request, queued }, queued ? 202 : 201);
  },
  { roles: ["BUYER"], permission: "financing:create" }
);
