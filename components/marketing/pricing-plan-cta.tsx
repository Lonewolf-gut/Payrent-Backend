"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

type PricingPlanCtaProps = {
  href: string;
  highlight: boolean;
  label: string;
  plan?: "FREE" | "PRO" | "MAX";
};

export function PricingPlanCta({ href, highlight, label, plan }: PricingPlanCtaProps) {
  const { data: session } = useSession();
  const destination =
    session?.user && plan && plan !== "FREE"
      ? `/pricing?plan=${plan}`
      : session?.user
        ? "/pricing"
        : plan === "FREE"
          ? href
          : plan
            ? `/login?callbackUrl=${encodeURIComponent(`/pricing?plan=${plan}`)}`
            : "/pricing";

  return (
    <Link
      href={destination}
      className={`mt-8 inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition ${
        highlight
          ? "bg-emerald-600 text-white hover:bg-emerald-700"
          : "border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
      }`}
    >
      {label}
    </Link>
  );
}
