import { NextRequest } from "next/server";
import { z } from "zod";
import { demoFinancingService } from "@/lib/services/demo-financing.service";
import { apiResponse, withAuth } from "@/lib/api/handler";

const advanceSchema = z.object({
  mode: z.enum(["step", "full"]).default("step"),
});

export const GET = withAuth(
  async (_req: NextRequest, context) => {
    const { id } = await context.params;
    const state = await demoFinancingService.getWalkthroughState(id);
    return apiResponse(state);
  },
  { roles: ["ADMIN"] }
);

export const POST = withAuth(
  async (req: NextRequest, context, session) => {
    const { id } = await context.params;
    const parsed = advanceSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiResponse({ error: "Invalid input" }, 400);
    }

    const result =
      parsed.data.mode === "full"
        ? await demoFinancingService.runFullWalkthrough(id, session.user.id)
        : await demoFinancingService.advanceOneStep(id, session.user.id);

    return apiResponse(result, 200, "Demo financing step completed.");
  },
  { roles: ["ADMIN"] }
);
