"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PLATFORM_NAME,
  SUPPORT_ADDRESS,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from "@/constants/platform";

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message ?? "Unable to send your message");
      }

      setStatus("success");
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-emerald-950">Contact us</h1>
        <p className="mt-4 text-muted-foreground">
          Have a question about listings, financing, subscriptions, or your account? Reach out to
          the {PLATFORM_NAME} team and we will respond as soon as possible.
        </p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-6">
            <h2 className="text-lg font-semibold text-emerald-950">Get in touch</h2>
            <ul className="mt-5 space-y-4 text-sm text-slate-700">
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-emerald-800">
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <span>{SUPPORT_PHONE}</span>
              </li>
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <span>{SUPPORT_ADDRESS}</span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-emerald-100 p-6 text-sm text-slate-600">
            <p className="font-medium text-emerald-950">Support hours</p>
            <p className="mt-2">Monday – Friday, 9:00 AM – 6:00 PM GMT</p>
            <p className="mt-4">
              For account security issues, include your registered email and a brief description
              of the problem.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl border border-emerald-100 bg-white p-6 shadow-sm lg:col-span-3"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Full name</Label>
              <Input
                id="contact-name"
                required
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-subject">Subject</Label>
            <Input
              id="contact-subject"
              required
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              placeholder="How can we help?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-message">Message</Label>
            <Textarea
              id="contact-message"
              required
              rows={6}
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
              placeholder="Tell us more about your question or issue..."
            />
          </div>

          {status === "success" ? (
            <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Thank you! Your message has been sent. We will reply to your email shortly.
            </p>
          ) : null}

          {status === "error" ? (
            <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={status === "loading"}
            >
              {status === "loading" ? "Sending..." : "Send message"}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
