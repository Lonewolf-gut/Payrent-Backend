import {
  Bell,
  Building2,
  HandCoins,
  LayoutDashboard,
  Smartphone,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: LayoutDashboard,
    title: "Role-based dashboards",
    text: "Dedicated workspaces for Customers, merchants, Affiliates, and lenders — each with the tools they need.",
  },
  {
    icon: Building2,
    title: "Listing & application management",
    text: "Publish properties, cars, and appliances. Review applications and track status from one place.",
  },
  {
    icon: HandCoins,
    title: "Pay-for-me financing",
    text: "Customers request financing, lenders review deals, and everyone follows the same transparent workflow.",
  },
  {
    icon: Wallet,
    title: "Wallets, settlements & payouts",
    text: "Top up, withdraw, and track settlements with verified bank and MoMo accounts.",
  },
  {
    icon: UserCheck,
    title: "KYC & verification tools",
    text: "Ghana Card checks, bank validation, and profile verification built into onboarding.",
  },
  {
    icon: Smartphone,
    title: "Mandates & repayments",
    text: "Set up direct debit mandates and monitor scheduled repayments with clear status updates.",
  },
  {
    icon: Bell,
    title: "In-app notifications",
    text: "Stay on top of approvals, payments, and account activity without leaving the platform.",
  },
  {
    icon: Users,
    title: "Affiliate assignment",
    text: "Merchants assign Affiliates to listings so deals move faster with shared visibility.",
  },
] as const;

export function PlatformFeaturesSection() {
  return (
    <section id="platform-features" className="border-t border-emerald-100 bg-emerald-50/50 py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 sm:text-sm">
            Platform features
          </p>
          <h2 className="mt-3 text-xl font-bold text-emerald-950 sm:text-3xl">
            Everything you need to rent, list, and finance
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-emerald-900/70 sm:text-base">
            Powerful tools for every role — from browsing listings to closing financed deals.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="border border-emerald-100 bg-white text-slate-900 shadow-sm ring-0"
            >
              <CardHeader className="space-y-2 p-4 sm:p-5">
                <feature.icon className="h-5 w-5 text-emerald-600 sm:h-6 sm:w-6" />
                <CardTitle className="text-sm text-emerald-950 sm:text-base">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
                <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">{feature.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
