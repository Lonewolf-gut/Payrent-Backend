import { NextRequest } from "next/server";
import { z } from "zod";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { resolveProtectedFileAccess } from "@/lib/storage/access";

const accessSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("kyc"), documentId: z.string().cuid() }),
  z.object({ scope: z.literal("financing"), documentId: z.string().cuid() }),
  z.object({ scope: z.literal("application"), documentId: z.string().cuid() }),
  z.object({ scope: z.literal("mandate"), mandateId: z.string().cuid() }),
  z.object({ scope: z.literal("property-document"), fileKey: z.string().min(3) }),
  z.object({ scope: z.literal("profile") }),
]);

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  const parsed = accessSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiResponse(null, 400, parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  try {
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const access = await resolveProtectedFileAccess({
      request: parsed.data,
      userId: session.user.id,
      role: session.user.role,
      appBaseUrl,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return apiResponse(access, 200, "File access granted.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to access file.";
    return apiResponse(null, 403, message);
  }
});
