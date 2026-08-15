import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { getToken } from "next-auth/jwt";
import type { UserRole } from "@prisma/client";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db/prisma";
import type { AppSession } from "@/lib/api/handler";

export function sessionTokenCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export function appSessionFromJwt(
  token: Record<string, unknown> | null | undefined
): AppSession | null {
  if (!token?.sub || !token.email) return null;

  return {
    user: {
      id: token.sub as string,
      email: token.email as string,
      role: token.role as UserRole,
      image: (token.picture as string | null | undefined) ?? null,
      twoFactorEnabled: Boolean(token.twoFactorEnabled),
      emailVerified: Boolean(token.emailVerified),
      phoneVerified: Boolean(token.phoneVerified),
    },
    expires: token.exp
      ? new Date((token.exp as number) * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  } as Session as AppSession;
}

/** Read the signed-in user from request cookies (works for proxied split-repo API calls). */
export async function getSessionFromRequest(
  req: NextRequest
): Promise<AppSession | null> {
  if (!process.env.AUTH_SECRET) return null;

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    cookieName: sessionTokenCookieName(),
  });

  return appSessionFromJwt(token as Record<string, unknown> | null);
}

export async function resolveAppSession(req: NextRequest): Promise<AppSession | null> {
  const fromRequest = await getSessionFromRequest(req);
  if (fromRequest) return fromRequest;

  // Server components without a NextRequest still use auth().
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (session?.user?.id && session.user.email) {
      return session as AppSession;
    }
  } catch {
    // ignore
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const payload = verifyAccessToken(authHeader.slice(7));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        image: true,
        twoFactorEnabled: true,
        emailVerified: true,
        phoneVerified: true,
        isActive: true,
      },
    });

    if (!user?.isActive) return null;

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        image: user.image,
        twoFactorEnabled: user.twoFactorEnabled,
        emailVerified: Boolean(user.emailVerified),
        phoneVerified: Boolean(user.phoneVerified),
      },
      expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    } as Session as AppSession;
  } catch {
    return null;
  }
}
