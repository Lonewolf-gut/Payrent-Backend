"use client";

import { useSession } from "next-auth/react";
import { MessagesWidget } from "@/components/dashboard/messaging/messages-widget";

export function MarketingSignedInExtras() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  if (!session?.user || role === "ADMIN" || role === "COMPLIANCE_OFFICER") return null;

  return <MessagesWidget />;
}
