import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const GET = withAuth(
  async (req: NextRequest) => {
    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10),
      500
    );
    const action = req.nextUrl.searchParams.get("action");
    const entity = req.nextUrl.searchParams.get("entity");

    const where = {
      ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
      ...(entity ? { entity: { equals: entity, mode: "insensitive" as const } } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        where,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          userId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          user: { select: { email: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return apiResponse({ logs, total });
  },
  { roles: ["ADMIN"], permission: "admin:transactions" }
);
