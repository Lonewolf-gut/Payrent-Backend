import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPostLoginRoute } from "@/lib/auth/permissions";
import { shouldRedirectStaffFromMarketing } from "@/lib/auth/route-guards";
import MarketingLayout from "./(marketing)/layout";
import HomePage from "@/components/marketing/home-page";

export default async function RootPage() {
  const session = await auth();
  if (session?.user?.role && shouldRedirectStaffFromMarketing(session.user.role)) {
    redirect(getPostLoginRoute(session.user.role));
  }

  return (
    <MarketingLayout>
      <HomePage />
    </MarketingLayout>
  );
}
