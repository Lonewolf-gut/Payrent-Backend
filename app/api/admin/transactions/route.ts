import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const GET = withAuth(
  async (req) => {
    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10), 500);
    const skip = (page - 1) * limit;

    const [transactions, total, commissionSum] = await Promise.all([
      prisma.walletTransaction.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          wallet: {
            select: {
              type: true,
              user: { select: { email: true, role: true } },
            },
          },
          commissionRecord: true,
        },
      }),
      prisma.walletTransaction.count(),
      prisma.commission.aggregate({ _sum: { totalFee: true } }),
    ]);

    return apiResponse({
      transactions,
      total,
      totalCommission: commissionSum._sum.totalFee ?? 0,
      page,
      limit,
    });
  },
  { roles: ["ADMIN"], permission: "admin:transactions" }
);
