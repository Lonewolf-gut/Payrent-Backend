import { NextRequest } from "next/server";
import { registerSchema, firstZodIssueMessage } from "@/lib/validations/auth";
import { authService } from "@/lib/services/auth.service";
import { apiResponse, apiError, withPublicHandler } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";

function requestContext(req: NextRequest) {
  return {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  };
}

export const POST = withPublicHandler(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(
      new AppError("Invalid registration request. Please refresh and try again.", 400)
    );
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      new AppError(
        firstZodIssueMessage(
          parsed.error,
          "Please review your registration details and try again."
        ),
        400
      )
    );
  }

  const result = await authService.register(parsed.data, requestContext(req));
  return apiResponse(result, 201);
});
