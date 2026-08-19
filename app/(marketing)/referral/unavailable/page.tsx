import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ReferralUnavailablePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Promotion link unavailable</h1>
      <p className="mt-3 text-muted-foreground">
        This affiliate link is invalid, expired, or the listing is no longer active. Ask the
        affiliate to send you an updated link, or browse listings below.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <Link href="/properties">Browse listings</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go to home</Link>
        </Button>
      </div>
    </div>
  );
}
