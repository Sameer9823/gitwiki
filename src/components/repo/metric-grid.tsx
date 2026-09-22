"use client";

import * as React from "react";
import { useGSAP } from "@gsap/react";
import { staggerReveal } from "@/lib/animations";

export function MetricGrid({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!ref.current) return;
    staggerReveal(ref.current.children);
  }, []);

  return (
    <div ref={ref} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}
