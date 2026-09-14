"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useGSAP } from "@gsap/react";
import { pageEnter } from "@/lib/animations";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = React.useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (ref.current) pageEnter(ref.current);
    },
    { dependencies: [pathname], scope: ref }
  );

  return <div ref={ref}>{children}</div>;
}
