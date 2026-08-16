import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { withResolvedPropertyImages } from "@/lib/utils/property-media";
import { z } from "zod";

export const GET = withAuth(async (_req, _ctx, session) => {
  const saved = await prisma.savedProperty.findMany({
    where: { userId: session.user.id },
    include: {
      property: { include: { images: { take: 1, orderBy: { order: "asc" } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return apiResponse(
    saved.map((entry) => ({
      ...entry,
      property: withResolvedPropertyImages(entry.property),
    }))
  );
});

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  const { propertyId } = z.object({ propertyId: z.string().cuid() }).parse(
    await req.json()
  );

  const saved = await prisma.savedProperty.upsert({
    where: {
      userId_propertyId: { userId: session.user.id, propertyId },
    },
    create: { userId: session.user.id, propertyId },
    update: {},
    include: { property: true },
  });
  return apiResponse(saved, 201);
});

export const DELETE = withAuth(async (req: NextRequest, _ctx, session) => {
  const propertyId = req.nextUrl.searchParams.get("propertyId");
  if (!propertyId) return apiResponse({ error: "propertyId required" }, 400);

  await prisma.savedProperty.deleteMany({
    where: { userId: session.user.id, propertyId },
  });
  return apiResponse({ removed: true });
});
