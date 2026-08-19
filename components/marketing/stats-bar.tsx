"use client";

import { useEffect, useRef, useState } from "react";

const STATS = [
  { label: "50+ property & other listings", target: 50, suffix: "+" },
  { label: "Roles supported", target: 4, suffix: "" },
  { label: "Reliability", target: 100, suffix: "%" },
  { label: "Subscription access", text: "Available" },
] as const;

function useInViewOnce(margin = "-80px") {
  const ref = useRef<HTMLSpanElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || isInView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin, threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isInView, margin]);

  return { ref, isInView };
}

function CountUpValue({
  target,
  suffix,
  duration = 1600,
}: {
  target: number;
  suffix: string;
  duration?: number;
}) {
  const { ref, isInView } = useInViewOnce();
  const [value, setValue] = useState(1);

  useEffect(() => {
    if (!isInView) return;

    const start = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.max(1, Math.round(eased * target));
      setValue(next);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [duration, isInView, target]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

function TextStat({ text }: { text: string }) {
  const { ref, isInView } = useInViewOnce();

  return (
    <span
      ref={ref}
      className={`inline-block transition-all duration-700 ${
        isInView ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      {text}
    </span>
  );
}

export function StatsBar() {
  return (
    <section
      aria-label="Platform statistics"
      className="w-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 py-10"
    >
      <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-x-4 gap-y-6 px-4 text-center sm:grid-cols-4 sm:gap-8 sm:px-6">
        {STATS.map((stat) => (
          <div key={stat.label}>
            <p className="text-2xl font-bold text-white sm:text-3xl">
              {"text" in stat ? (
                <TextStat text={stat.text} />
              ) : (
                <CountUpValue target={stat.target} suffix={stat.suffix} />
              )}
            </p>
            <p className="mt-1 text-xs text-emerald-50 sm:text-sm">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
