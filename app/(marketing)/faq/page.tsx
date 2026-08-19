import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PLATFORM_NAME, SUPPORT_EMAIL } from "@/constants/platform";

const faqSections = [
  {
    title: "Getting started",
    items: [
      {
        q: `What is ${PLATFORM_NAME}?`,
        a: `${PLATFORM_NAME} is a rental finance marketplace in Ghana that connects Customers, merchants, Affiliates, and lenders. You can browse and list properties, vehicles, and appliances; submit applications; request rent financing; and manage payments through verified workflows.`,
      },
      {
        q: "Who can create an account?",
        a: "Customers, merchants, Affiliates, and lenders can register. Each role gets a dedicated dashboard with tools tailored to their part in the rental and financing chain. Administrator accounts are created internally by the platform team.",
      },
      {
        q: "How do I register?",
        a: 'Click "Get started" on the homepage, choose your role, and complete the registration form with your name, email, phone number, and password. You will receive a verification code by email to activate your account.',
      },
      {
        q: "Is there a free plan?",
        a: "Yes. Every new account starts on the Free plan with access to core marketplace features. You can upgrade to Premium at any time from your dashboard subscription page.",
      },
    ],
  },
  {
    title: "Accounts & verification",
    items: [
      {
        q: "Why do I need to verify my email?",
        a: "Email verification confirms your contact details and unlocks full dashboard access, including applications, financing requests, and wallet features.",
      },
      {
        q: "What is KYC verification?",
        a: "Know Your Customer (KYC) verification confirms your identity using your Ghana Card, proof of address, and employment details where applicable. Verified accounts can access financing, withdrawals, and other sensitive features.",
      },
      {
        q: "How does bank account verification work?",
        a: "You add your bank account in Settings. We validate the account name against your profile through our payment partners. Verified accounts are required for withdrawals and certain settlement flows.",
      },
      {
        q: "My account was suspended — what should I do?",
        a: `Contact ${SUPPORT_EMAIL} with your registered email address. Our team will review your account and explain any next steps.`,
      },
    ],
  },
  {
    title: "Listings & applications",
    items: [
      {
        q: "How do merchants publish listings?",
        a: "Merchants create a listing from their dashboard, add photos and details, and submit for review. Once approved, the listing appears on the public properties page for Customers to browse and apply.",
      },
      {
        q: "How do Customers apply for a listing?",
        a: "Browse published listings, open a property you are interested in, and submit an application with the required details. The merchant (or assigned Affiliate) reviews your application and approves or requests clarification.",
      },
      {
        q: "Can Affiliates manage listings for merchants?",
        a: "Yes. Merchants can assign Affiliates to their listings. Affiliates can support application review, Customer communication, and listing management within their assigned scope.",
      },
      {
        q: "What listing categories are supported?",
        a: "The platform supports residential and commercial properties, vehicles, and appliances. Each category has its own listing fields and review workflow.",
      },
    ],
  },
  {
    title: "Rent financing",
    items: [
      {
        q: "How does Pay for Rent financing work?",
        a: "After a Customer's application is approved, they can request financing for the rental amount. The Customer sets up a repayment mandate, lenders review eligible requests, and upon approval funds are disbursed according to the agreed schedule.",
      },
      {
        q: "Who can request financing?",
        a: "Customers with verified accounts and approved applications can request financing. Eligibility depends on KYC status, mandate setup, and lender review criteria.",
      },
      {
        q: "What is a repayment mandate?",
        a: "A mandate authorises scheduled deductions from the Customer's bank account or mobile money wallet to repay the financed amount. Mandates go through submission, admin review, and bank processing before becoming active.",
      },
      {
        q: "How do lenders participate?",
        a: "Lenders register on the platform, review financing requests that meet their criteria, approve or reject applications, and monitor repayment performance from their dashboard.",
      },
    ],
  },
  {
    title: "Subscriptions & billing",
    items: [
      {
        q: "Do Customers or lenders need a subscription?",
        a: "No. Customer and lender accounts are free. Browse listings, apply, request financing (Customers), and review the full financing queue (lenders) without a monthly plan. Subscriptions apply to merchants and Affiliates.",
      },
      {
        q: "How do merchant and Affiliate subscriptions work?",
        a: "Merchants and Affiliates start on the Free plan with listing or promotion limits. Upgrade to Pro or Max from the Pricing page via wallet or Paystack for more capacity.",
      },
      {
        q: "What are the Free plan limits?",
        a: "Merchants can list 1 residential property, 1 car, and 1 appliance (3 total). Free Affiliates can promote 1 listing. Pro and Max unlock higher or unlimited capacity.",
      },
      {
        q: "Can I cancel my subscription?",
        a: "Merchants and Affiliates can cancel from the pricing page or subscription settings. When a paid plan expires, your account reverts to Free plan limits.",
      },
    ],
  },
  {
    title: "Payments & wallet",
    items: [
      {
        q: "How does the wallet work?",
        a: "Each user has a role-specific wallet for topping up, paying subscriptions, and receiving settlements. Wallet transactions are recorded in your transaction history.",
      },
      {
        q: "Which payment methods are supported?",
        a: "The platform supports mobile money and card payments through integrated payment providers including Paystack and Hubtel, depending on the transaction type.",
      },
      {
        q: "How do withdrawals work?",
        a: "Verified users with a validated bank account can request withdrawals from their wallet. Withdrawals may require admin review and are processed to your registered bank account.",
      },
      {
        q: "What are settlements?",
        a: "Settlements are payouts to merchants, Affiliates, or other parties after successful Customer payments or financing disbursements. Settlement status is tracked in your dashboard.",
      },
    ],
  },
  {
    title: "Security & privacy",
    items: [
      {
        q: "How is my data protected?",
        a: "We use encryption, role-based access controls, audit logs, and verified third-party integrations for KYC and payments. Sensitive documents are stored securely and accessed only by authorised personnel.",
      },
      {
        q: "Does PayForMe sell my personal data?",
        a: "No. We do not sell personal data. Information is shared only with service providers and regulators when necessary to operate the platform or meet legal obligations. See our Privacy Policy for details.",
      },
      {
        q: "Can I enable two-factor authentication?",
        a: "Yes. You can enable two-factor authentication (2FA) from your account Settings for an additional layer of security when signing in.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold text-emerald-950">Frequently asked questions</h1>
      <p className="mt-4 text-muted-foreground">
        Everything you need to know about accounts, listings, financing, and payments on{" "}
        {PLATFORM_NAME}. Can&apos;t find an answer?{" "}
        <Link href="/contact" className="text-emerald-700 underline underline-offset-2">
          Contact us
        </Link>
        .
      </p>

      <div className="mt-12 space-y-10">
        {faqSections.map((section) => (
          <section key={section.title}>
            <h2 className="mb-4 text-xl font-semibold text-emerald-900">{section.title}</h2>
            <Accordion type="single" collapsible className="rounded-lg border border-emerald-100 px-4">
              {section.items.map((item, index) => (
                <AccordionItem key={item.q} value={`${section.title}-${index}`}>
                  <AccordionTrigger className="text-left text-base text-emerald-950 hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="leading-relaxed text-slate-600">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/contact">Contact support</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
