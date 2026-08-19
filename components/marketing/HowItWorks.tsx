import Link from "next/link";
import React from "react";

type Step = {
  number: string;
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    number: "01",
    title: "Add your property",
    description:
      "Create your property, add units, set rent amounts and due dates. Invite your Affiliate if you have one — they get free access.",
  },
  {
    number: "02",
    title: "Add Customers & send leases",
    description:
      "Add a Customer's name and phone. The platform generates a Ghana-law lease and sends it to them via WhatsApp. They sign digitally — no app needed.",
  },
  {
    number: "03",
    title: "Collect rent automatically",
    description:
      "Customers pay via MoMo, card, or bank transfer. Rent goes directly to your account — never through an Affiliate. Receipts sent instantly to both parties.",
  },
  {
    number: "04",
    title: "Stay in control",
    description:
      "See all units, payments, maintenance, Affiliate commission, and expiring leases on one dashboard. Everything documented, everything searchable.",
  },
];

export default function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="max-w-6xl mx-auto px-6 py-12">
      <h2 id="how-it-works" className="text-2xl font-semibold mb-6 text-white">
        How it works
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {STEPS.map((s) => (
          <div
            key={s.number}
            className="rounded-lg p-6 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.04)]"
          >
            <div className="text-3xl font-bold text-primary-600 opacity-80 mb-3">{s.number}</div>
            <h3 className="text-lg font-semibold text-white mb-2">{s.title}</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{s.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href="/roles"
          className="inline-block bg-white text-gray-900 font-medium px-6 py-2 rounded hover:opacity-95"
        >
          Learn more
        </Link>
      </div>
    </section>
  );
}
