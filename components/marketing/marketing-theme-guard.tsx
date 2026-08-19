"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

export function MarketingThemeGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.style.colorScheme = "light";

    return () => {
      root.style.colorScheme = "";
    };
  }, [pathname]);

  return (
    <div className="min-h-screen bg-white text-slate-900 [color-scheme:light]">{children}</div>
  );
}
