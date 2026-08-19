import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PLATFORM_NAME, SUPPORT_EMAIL } from "@/constants/platform";

const LAST_UPDATED = "July 5, 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold text-emerald-950">Privacy Policy</h1>
      <p className="mt-4 text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-10 space-y-8 text-slate-700">
        <section>
          <h2 className="text-xl font-semibold text-emerald-950">1. Introduction</h2>
          <p className="mt-3 leading-relaxed">
            {PLATFORM_NAME} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates a rental
            finance marketplace connecting Customers, merchants, Affiliates, and lenders in Ghana. This
            Privacy Policy explains how we collect, use, store, and protect your personal
            information when you use our website, mobile experiences, and related services
            (collectively, the &quot;Platform&quot;).
          </p>
          <p className="mt-3 leading-relaxed">
            By creating an account or using the Platform, you acknowledge that you have read and
            understood this Privacy Policy. If you do not agree, please do not use the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">2. Information we collect</h2>
          <p className="mt-3 leading-relaxed">We may collect the following categories of data:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Account information:</strong> name, email address, phone number, password
              (stored in hashed form), role, and profile details.
            </li>
            <li>
              <strong>Identity verification (KYC):</strong> Ghana Card details, date of birth,
              address, employment information, and uploaded identity or supporting documents.
            </li>
            <li>
              <strong>Financial information:</strong> bank account details, mobile money numbers,
              wallet balances, transaction history, mandate records, and repayment schedules.
            </li>
            <li>
              <strong>Listing and application data:</strong> property details, photos, application
              forms, and communications related to listings and financing requests.
            </li>
            <li>
              <strong>Technical data:</strong> IP address, browser type, device information, log
              files, and usage analytics to improve security and performance.
            </li>
            <li>
              <strong>Communications:</strong> messages you send to us via contact forms, support
              requests, or email.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">3. How we use your information</h2>
          <p className="mt-3 leading-relaxed">We use personal data to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Create and manage your account and role-specific dashboard.</li>
            <li>Verify your identity, email, phone number, and bank account.</li>
            <li>Process listings, applications, financing requests, mandates, and settlements.</li>
            <li>Facilitate payments, wallet top-ups, subscriptions, and withdrawals.</li>
            <li>Send transactional notifications, verification codes, and service updates.</li>
            <li>Detect fraud, enforce platform policies, and maintain audit trails.</li>
            <li>Comply with applicable laws, regulations, and lawful requests from authorities.</li>
            <li>Improve the Platform, troubleshoot issues, and develop new features.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">4. Legal basis for processing</h2>
          <p className="mt-3 leading-relaxed">
            We process personal data where necessary to perform our contract with you (providing
            Platform services), to comply with legal obligations (including anti-money laundering
            and financial regulations), to protect legitimate interests (such as fraud prevention
            and platform security), and where you have given consent (for example, optional
            marketing communications where applicable).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">5. How we share information</h2>
          <p className="mt-3 leading-relaxed">
            We do not sell your personal data. We may share information with:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Other platform users</strong> where necessary for marketplace workflows
              (e.g., merchants reviewing Customer applications, Affiliates assigned to listings).
            </li>
            <li>
              <strong>Service providers</strong> including payment processors (Paystack, Hubtel),
              email and SMS providers, KYC verification partners, and cloud hosting providers.
            </li>
            <li>
              <strong>Regulators and law enforcement</strong> when required by law or to protect
              rights, safety, and property.
            </li>
            <li>
              <strong>Professional advisers</strong> such as auditors and legal counsel under
              confidentiality obligations.
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            All third parties are required to handle data securely and only for the purposes we
            specify.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">6. Data retention</h2>
          <p className="mt-3 leading-relaxed">
            We retain personal data for as long as your account is active and as needed to provide
            services, resolve disputes, enforce agreements, and comply with legal and regulatory
            record-keeping requirements. KYC documents and financial transaction records may be
            retained for longer periods where required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">7. Data security</h2>
          <p className="mt-3 leading-relaxed">
            We implement administrative, technical, and organisational measures to protect your
            data, including encryption in transit, access controls, role-based permissions, audit
            logging, and secure storage of sensitive documents. No method of transmission over the
            internet is completely secure; we encourage you to use a strong password and enable
            two-factor authentication where available.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">8. Your rights</h2>
          <p className="mt-3 leading-relaxed">
            Depending on applicable law, you may have the right to access, correct, update, or
            delete certain personal data, restrict or object to processing, and request a copy of
            data you have provided. You can update much of your profile information directly in
            account Settings. For other requests, contact us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-emerald-700 underline">
              {SUPPORT_EMAIL}
            </a>
            . We may need to verify your identity before fulfilling a request.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">9. Cookies and analytics</h2>
          <p className="mt-3 leading-relaxed">
            We use essential cookies and similar technologies to maintain sessions, remember
            preferences, and keep the Platform secure. We may use analytics tools to understand
            how users interact with the Platform so we can improve performance and usability.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">10. Children&apos;s privacy</h2>
          <p className="mt-3 leading-relaxed">
            The Platform is not intended for individuals under 18 years of age. We do not knowingly
            collect personal data from children. If you believe a minor has provided us with
            personal data, please contact us so we can take appropriate action.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">11. International transfers</h2>
          <p className="mt-3 leading-relaxed">
            Your data may be processed on servers located outside Ghana where our service providers
            operate. When data is transferred internationally, we take steps to ensure appropriate
            safeguards are in place consistent with applicable data protection requirements.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">12. Changes to this policy</h2>
          <p className="mt-3 leading-relaxed">
            We may update this Privacy Policy from time to time. Material changes will be posted on
            this page with an updated &quot;Last updated&quot; date. Continued use of the Platform
            after changes take effect constitutes acceptance of the revised policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-emerald-950">13. Contact us</h2>
          <p className="mt-3 leading-relaxed">
            For privacy-related questions or requests, contact us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-emerald-700 underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            or visit our{" "}
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
