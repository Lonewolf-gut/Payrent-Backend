import { NextRequest } from "next/server";
import { z } from "zod";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { financingRequestDocService } from "@/lib/services/financing-request-doc.service";

const reviewSchema = z.object({
  documentId: z.string().cuid(),
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNotes: z.string().optional(),
});

export const GET = withAuth(
  async (req: NextRequest) => {
    const status = req.nextUrl.searchParams.get("status");
    const parsed =
      status === "PENDING" || status === "APPROVED" || status === "REJECTED"
        ? status
        : undefined;
    const data = await financingRequestDocService.listForAdmin(parsed);
    return apiResponse(data);
  },
  { roles: ["ADMIN"] }
);

export const PATCH = withAuth(
  async (req: NextRequest, _ctx, session) => {
    const parsed = reviewSchema.safeParse(await req.json());
    if (!parsed.success) return apiResponse({ error: "Invalid input" }, 400);

    const doc = await financingRequestDocService.review(
      parsed.data.documentId,
      session.user.id,
      parsed.data.status,
      parsed.data.reviewNotes
    );
    return apiResponse(doc, 200, "Document review saved.");
  },
  { roles: ["ADMIN"] }
);
