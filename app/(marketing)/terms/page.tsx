import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PLATFORM_NAME, SUPPORT_EMAIL } from "@/constants/platform";

const LAST_UPDATED = "July 5, 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold text-emerald-950">Terms &amp; Conditions</h1>
      <p className="mt-4 text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-10 space-y-8 text-slate-700">
        <section>
          <h2 className="text-xl font-semibold text-emerald-950">1. Agreement to terms</h2>
          <p className="mt-3 leading-relaxed">
            These Terms &amp; Conditions (&quot;Terms&quot;) govern your access to and use of{" "}
            {PLATFORM_NAME} (the &quot;Platform&quot;), operated from Ghana. By registering for an
            account, browsing listings, or using any Platform service, you agree to be bound by
            these Terms and our{" "}
            <Link href="/privacy" className="text-emerald-700 underline">
              Privacy Policy
            </Link>
            . If you do not agree, you must not use the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">2. About the Platform</h2>
          <p className="mt-3 leading-relaxed">
            {PLATFORM_NAME} is a technology marketplace that facilitates connections between
            Customers, merchants, Affiliates, and lenders for rental listings, applications, rent
            financing, mandates, payments, and related services. We provide the infrastructure and
            workflows; we are not a merchant, lender, estate Affiliate, or financial institution unless
            explicitly stated otherwise.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">3. Eligibility</h2>
          <p className="mt-3 leading-relaxed">
            You must be at least 18 years old and capable of entering into a binding contract under
            Ghanaian law. You must provide accurate, complete, and current registration information.
            You are responsible for maintaining the confidentiality of your login credentials and
            for all activity under your account.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">4. User roles and responsibilities</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Customers</strong> must provide truthful application information and honour
              approved rental and repayment obligations.
            </li>
            <li>
              <strong>Merchants</strong> must list assets they are authorised to offer and respond
              to applications in good faith.
            </li>
            <li>
              <strong>Affiliates</strong> must act within the scope of their assignments and applicable
              agency regulations.
            </li>
            <li>
              <strong>Lenders</strong> must conduct their own due diligence and comply with
              applicable lending and consumer protection laws.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            All users must complete required verification steps (email, KYC, bank validation) before
            accessing restricted features.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">5. Listings and applications</h2>
          <p className="mt-3 leading-relaxed">
            Listings are subject to review and must not contain false, misleading, discriminatory,
            or unlawful content. {PLATFORM_NAME} may remove or suspend listings that violate these
            Terms or applicable law. Application and approval decisions between Customers and
            merchants (or their Affiliates) are made by those parties; the Platform facilitates the
            process but does not guarantee approval or availability of any listing.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">6. Rent financing</h2>
          <p className="mt-3 leading-relaxed">
            Financing requests are subject to eligibility checks, mandate setup, lender review, and
            applicable documentation requirements. Approval, funding amounts, interest terms, and
            repayment schedules are determined by the relevant lender and documented in the
            financing workflow. {PLATFORM_NAME} does not guarantee financing approval or specific
            terms. Customers remain responsible for repayments according to agreed schedules.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">7. Payments, wallet, and subscriptions</h2>
          <p className="mt-3 leading-relaxed">
            Wallet top-ups, subscription payments, and other charges are processed through
            third-party payment providers. You agree to pay all applicable fees displayed at the
            time of purchase. Subscription plans, listing limits, and feature access are described
            on the Pricing page and may change with reasonable notice. Withdrawals require verified
            identity and bank account details and may be subject to review, processing times, and
            platform fees.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">8. Mandates and direct debits</h2>
          <p className="mt-3 leading-relaxed">
            By submitting a repayment mandate, you authorise scheduled deductions as described in
            the mandate workflow. Mandates may require admin review and bank processing before
            becoming active. You are responsible for maintaining sufficient funds and for notifying
            us of any changes to your payment account.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">9. Prohibited conduct</h2>
          <p className="mt-3 leading-relaxed">You must not:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Provide false identity, financial, or listing information.</li>
            <li>Use the Platform for fraud, money laundering, or illegal activity.</li>
            <li>Attempt to bypass verification, security, or access controls.</li>
            <li>Harass, threaten, or discriminate against other users.</li>
            <li>Scrape, reverse engineer, or disrupt Platform systems without permission.</li>
            <li>Circumvent platform fees by conducting off-platform transactions initiated on {PLATFORM_NAME}.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">10. Intellectual property</h2>
          <p className="mt-3 leading-relaxed">
            The Platform, including its design, software, logos, and content (excluding user-generated
            content), is owned by or licensed to {PLATFORM_NAME}. You retain ownership of content
            you upload but grant us a licence to use, display, and process it as needed to operate
            the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">11. Disclaimers</h2>
          <p className="mt-3 leading-relaxed">
            The Platform is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To
            the fullest extent permitted by law, {PLATFORM_NAME} disclaims warranties regarding
            listing accuracy, financing outcomes, uninterrupted service, or fitness for a particular
            purpose. We do not guarantee that any Customer, merchant, Affiliate, or lender will complete a
            transaction.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">12. Limitation of liability</h2>
          <p className="mt-3 leading-relaxed">
            To the maximum extent permitted by Ghanaian law, {PLATFORM_NAME} and its officers,
            employees, and partners shall not be liable for indirect, incidental, special, or
            consequential damages arising from your use of the Platform, including disputes between
            users, payment failures by third parties, or loss of data. Our total liability for any
            claim relating to the Platform shall not exceed the fees you paid to us in the twelve
            (12) months preceding the claim, or GHS 500, whichever is greater.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">13. Suspension and termination</h2>
          <p className="mt-3 leading-relaxed">
            We may suspend or terminate your account if you breach these Terms, fail verification
            requirements, engage in fraudulent activity, or if required by law. You may close your
            account by contacting support, subject to settlement of outstanding obligations.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">14. Dispute resolution</h2>
          <p className="mt-3 leading-relaxed">
            We encourage users to resolve disputes through the Platform&apos;s communication and
            support channels first. These Terms are governed by the laws of Ghana. Any disputes that
            cannot be resolved amicably shall be subject to the exclusive jurisdiction of the
            courts of Ghana, unless otherwise required by mandatory consumer protection law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">15. Changes to these Terms</h2>
          <p className="mt-3 leading-relaxed">
            We may modify these Terms at any time. Updated Terms will be posted on this page with a
            revised &quot;Last updated&quot; date. Material changes may also be communicated via
            email or in-app notification. Continued use after changes constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">16. Contact</h2>
          <p className="mt-3 leading-relaxed">
            Questions about these Terms may be sent to{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-emerald-700 underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            or via our{" "}
            <Link href="/contact" className="text-emerald-700 underline">
              Contact page
            </Link>
            .
          </p>
        </section>
      </div>

      <Button asChild variant="outline" className="mt-10">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
