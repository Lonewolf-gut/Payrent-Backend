import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandlordAgentPricingCta() {
  return (
    <section id="pricing" className="border-y border-slate-200 bg-slate-100 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            For merchants &amp; Affiliates
          </p>
          <h2 className="mt-4 font-serif text-3xl font-bold tracking-tight text-slate-800 sm:text-4xl">
            Optional plans when your portfolio grows
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-500">
            Customers and lenders use PayForMe for free. Subscription plans are only for
            merchants and Affiliates who want more listings, applications, and admin tools.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              asChild
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Link href="/pricing">
                View merchant &amp; Affiliate plans <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              <Link href="/register">Create a free account</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
