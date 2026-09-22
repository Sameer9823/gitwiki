"use client";

import * as React from "react";
import { useGSAP } from "@gsap/react";
import { animateCounter } from "@/lib/animations";

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  suffix?: string;
  hint?: string;
}

export function MetricCard({ icon: Icon, label, value, suffix = "", hint }: MetricCardProps) {
  const numRef = React.useRef<HTMLParagraphElement>(null);

  useGSAP(() => {
    if (numRef.current && typeof value === "number") {
      animateCounter(numRef.current, value, {
        formatter: (n) => `${Math.round(n).toLocaleString()}${suffix}`,
      });
    }
  }, [value]);

  return (
    <div className="group rounded-xl border border-border bg-surface p-4 transition-[transform,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-border-strong">
      <div className="flex items-center gap-2 text-text-subtle">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p ref={numRef} className="mt-2 font-mono text-2xl font-semibold text-text">
        {value == null ? "—" : `0${suffix}`}
      </p>
      {hint && <p className="mt-1 text-xs text-text-subtle">{hint}</p>}
    </div>
  );
}
