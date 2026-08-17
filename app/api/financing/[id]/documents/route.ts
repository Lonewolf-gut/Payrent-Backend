import { NextRequest } from "next/server";
import { z } from "zod";
import { TenantFinancingDocType } from "@prisma/client";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { financingRequestDocService } from "@/lib/services/financing-request-doc.service";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(
  async (_req: NextRequest, ctx: RouteContext, session) => {
    const { id } = await ctx.params;
    const data = await financingRequestDocService.listForRequest(session.user.id, id);
    return apiResponse(data);
  },
  { roles: ["BUYER"] }
);

export const POST = withAuth(
  async (req: NextRequest, ctx: RouteContext, session) => {
    const { id } = await ctx.params;
    const formData = await req.formData();
    const documentType = formData.get("documentType")?.toString() as TenantFinancingDocType;
    const file = formData.get("document");

    if (!(file instanceof File) || !file.name) {
      return apiResponse({ error: "Document file required" }, 400);
    }

    const parsed = z.nativeEnum(TenantFinancingDocType).safeParse(documentType);
    if (!parsed.success) {
      return apiResponse({ error: "Invalid document type" }, 400);
    }

    const doc = await financingRequestDocService.upload(
      session.user.id,
      id,
      parsed.data,
      file
    );
    return apiResponse(doc, 201);
  },
  { roles: ["BUYER"] }
);

export const DELETE = withAuth(
  async (req: NextRequest, ctx: RouteContext, session) => {
    const { id } = await ctx.params;
    const documentType = req.nextUrl.searchParams.get("documentType");

    const parsed = z.nativeEnum(TenantFinancingDocType).safeParse(documentType);
    if (!parsed.success) {
      return apiResponse({ error: "Invalid document type" }, 400);
    }

    const result = await financingRequestDocService.remove(
      session.user.id,
      id,
      parsed.data
    );
    return apiResponse(result);
  },
  { roles: ["BUYER"] }
);
