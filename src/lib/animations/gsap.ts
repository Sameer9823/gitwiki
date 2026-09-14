import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

// Register the React helper once, app-wide. useGSAP handles cleanup on
// unmount for us (including any ScrollTriggers created inside its scope),
// so individual components never need to remember gsap.context() teardown.
gsap.registerPlugin(useGSAP);

/**
 * Shared motion tokens so every screen in Codexa animates with the same
 * rhythm instead of ad-hoc durations/eases scattered through components.
 */
export const EASE = {
  out: "power2.out",
  inOut: "power2.inOut",
  emphasized: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

export const DURATION = {
  micro: 0.15, // icon/button hover
  fast: 0.18, // dropdowns, command palette
  normal: 0.35, // page transitions, card reveals
  slow: 0.6, // hero / graph entrances
} as const;

/** Returns true if the user has requested reduced motion. Decorative
 * (non-essential) animations should check this and skip themselves. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap };
