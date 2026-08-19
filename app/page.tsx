import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPostLoginRoute } from "@/lib/auth/permissions";
import { shouldRedirectStaffFromMarketing } from "@/lib/auth/route-guards";

function BackendApiLanding() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        maxWidth: "36rem",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>PayRent Backend API</h1>
      <p style={{ marginTop: "0.75rem", color: "#555" }}>
        Business APIs run on this server (port 3001). Open the frontend app for the UI.
      </p>
      <p style={{ marginTop: "1rem" }}>
        <a href="/api/health" style={{ color: "#047857", textDecoration: "underline" }}>
          Check API health
        </a>
      </p>
    </main>
  );
}

export default async function RootPage() {
  if (process.env.BACKEND_ONLY === "true") {
    return <BackendApiLanding />;
  }

  const MarketingLayout = (await import("./(marketing)/layout")).default;
  const HomePage = (await import("@/components/marketing/home-page")).default;

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
