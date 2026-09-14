import { gsap, DURATION, EASE, prefersReducedMotion } from "./gsap";

/**
 * Standard page-enter transition per the design spec: quick opacity + 8px
 * rise, never a slow cinematic fade. Intended to run once per route change
 * on the main content wrapper (see src/app/*\/loading.tsx or a client
 * layout wrapper), not on every internal re-render.
 */
export function pageEnter(target: gsap.TweenTarget) {
  if (prefersReducedMotion()) return gsap.set(target, { opacity: 1, y: 0 });
  return gsap.fromTo(
    target,
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: DURATION.normal, ease: EASE.out }
  );
}
