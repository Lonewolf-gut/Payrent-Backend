import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth } from "@/lib/api/handler";
import type { FinancingStatus } from "@prisma/client";

export const GET = withAuth(
  async (req: NextRequest) => {
    const status = req.nextUrl.searchParams.get("status") as FinancingStatus | null;
    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);
    const limit = 30;
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [requests, total] = await Promise.all([
      prisma.financingRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          tenant: {
            include: { user: { select: { email: true } } },
          },
          property: { select: { id: true, name: true, location: true } },
          investment: {
            include: { lender: { include: { user: { select: { email: true } } } } },
          },
          lenderTags: {
            include: {
              lender: {
                include: { user: { select: { id: true, email: true } } },
              },
            },
          },
        },
      }),
      prisma.financingRequest.count({ where }),
    ]);

    const pendingCount = await prisma.financingRequest.count({
      where: {
        status: {
          in: [
            "ELIGIBILITY_PENDING",
            "PENDING",
            "UNDER_REVIEW",
            "READY_FOR_LENDER_REVIEW",
          ],
        },
      },
    });

    return apiResponse({ requests, total, page, limit, pendingCount });
  },
  { roles: ["ADMIN"], permission: "admin:transactions" }
);
