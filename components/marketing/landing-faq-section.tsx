import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PLATFORM_NAME, SUPPORT_EMAIL } from "@/constants/platform";

const landingFaqs = [
  {
    q: `What is ${PLATFORM_NAME}?`,
    a: `${PLATFORM_NAME} is a rental finance marketplace in Ghana that connects Customers, merchants, Affiliates, and lenders. Browse and list properties, vehicles, and appliances; apply for listings; request pay-for-me financing; and manage payments in one place.`,
  },
  {
    q: "Is there a free plan?",
    a: "Yes. Customer and lender accounts are free. Merchants and Affiliates start with a 7-day trial, then can stay on the Free plan or upgrade to Pro or Max for more listing capacity.",
  },
  {
    q: "Who needs a paid subscription?",
    a: "Only merchants and Affiliates need a subscription to list or be assigned to listings beyond Free plan limits. Customers and lenders never pay a monthly fee to use the platform.",
  },
  {
    q: "How does pay-for-me financing work?",
    a: "After your application is approved, you can request financing for a rental or purchase. Lenders review eligible requests, and once approved, repayments are tracked through mandates and your dashboard.",
  },
  {
    q: "How are payments kept secure?",
    a: "We use verified bank and MoMo accounts, encrypted data handling, role-based access, audit logs, and identity checks so every sensitive transaction is traceable and protected.",
  },
  {
    q: "How do I get started?",
    a: 'Click "Get started", choose your role, and complete registration. Verify your email, finish your profile, and access your role-specific dashboard in minutes.',
  },
  {
    q: "My account was suspended — what should I do?",
    a: `Contact ${SUPPORT_EMAIL} with your registered email. Our team will review your account and explain any next steps.`,
  },
] as const;

export function LandingFaqSection() {
  return (
    <section id="faq" className="bg-white py-12 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 sm:text-sm">
            FAQ
          </p>
          <h2 className="mt-3 text-xl font-bold text-emerald-950 sm:text-3xl">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            Quick answers before you get started. Need more detail?{" "}
            <Link href="/faq" className="font-medium text-emerald-700 underline underline-offset-2">
              View all FAQs
            </Link>
            .
          </p>
        </div>

        <Accordion type="single" collapsible className="mt-8 rounded-xl border border-emerald-100 px-4 sm:mt-10">
          {landingFaqs.map((item, index) => (
            <AccordionItem key={item.q} value={`landing-faq-${index}`}>
              <AccordionTrigger className="text-left text-sm text-emerald-950 hover:no-underline sm:text-base">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-xs leading-relaxed text-slate-600 sm:text-sm">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline" size="sm" className="sm:size-default">
            <Link href="/faq">See all questions</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="sm:size-default">
            <Link href="/contact">Contact support</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
