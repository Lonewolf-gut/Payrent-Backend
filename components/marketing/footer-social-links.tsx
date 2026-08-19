import Link from "next/link";
import { FaInstagram, FaLinkedin, FaTiktok, FaXTwitter } from "react-icons/fa6";
import { SOCIAL_LINKS } from "@/constants/platform";
import { cn } from "@/lib/utils";

const SOCIAL_ICONS = {
  LinkedIn: FaLinkedin,
  X: FaXTwitter,
  Instagram: FaInstagram,
  TikTok: FaTiktok,
} as const;

type FooterSocialLinksProps = {
  className?: string;
};

export function FooterSocialLinks({ className }: FooterSocialLinksProps) {
  return (
    <div className={cn("mt-5 flex items-center gap-3", className)}>
      {SOCIAL_LINKS.map((link) => {
        const Icon = SOCIAL_ICONS[link.label];

        return (
          <Link
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Follow PayForMe on ${link.label}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 text-emerald-700 transition hover:border-emerald-600 hover:bg-emerald-600 hover:text-white"
          >
            <Icon className="h-4 w-4" aria-hidden />
          </Link>
        );
      })}
    </div>
  );
}
