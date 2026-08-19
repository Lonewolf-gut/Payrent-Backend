import { NextRequest } from "next/server";
import { z } from "zod";
import { messageService } from "@/lib/services/message.service";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const GET = withAuth(async (_req, _ctx, session) => {
  const conversations = await messageService.listConversations(session.user.id);
  return apiResponse(conversations);
});

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  const body = await req.json();
  const schema = z.object({
    recipientId: z.string().cuid().optional(),
    conversationId: z.string().cuid().optional(),
    content: z.string().min(1).max(5000).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiResponse({ error: "Invalid input" }, 400);

  const content = parsed.data.content?.trim();

  if (parsed.data.conversationId) {
    if (!content) {
      return apiResponse({ error: "Message content required" }, 400);
    }

    const message = await messageService.sendMessage(
      parsed.data.conversationId,
      session.user.id,
      content
    );
    return apiResponse({ ...message, conversationId: parsed.data.conversationId }, 201);
  }

  if (parsed.data.recipientId) {
    const conv = await messageService.getOrCreateConversation([
      session.user.id,
      parsed.data.recipientId,
    ]);

    if (!content) {
      return apiResponse({ conversationId: conv.id });
    }

    const message = await messageService.sendMessage(conv.id, session.user.id, content);
    return apiResponse({ ...message, conversationId: conv.id }, 201);
  }

  return apiResponse({ error: "Conversation or recipient required" }, 400);
});
