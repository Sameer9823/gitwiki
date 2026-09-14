import { gsap, DURATION, EASE, prefersReducedMotion } from "./gsap";

/**
 * Reveal a list/grid of elements (metric cards, sidebar nav items, wiki TOC
 * entries) with a small, deliberate stagger. Keep `amount` between
 * 0.05–0.1s per the design spec — anything larger reads as sluggish.
 */
export function staggerReveal(
  targets: gsap.TweenTarget,
  opts: { amount?: number; y?: number } & gsap.TweenVars = {}
) {
  const { amount = 0.06, y = 16, ...rest } = opts;
  if (prefersReducedMotion()) return gsap.set(targets, { opacity: 1, y: 0 });
  return gsap.fromTo(
    targets,
    { opacity: 0, y },
    {
      opacity: 1,
      y: 0,
      duration: DURATION.normal,
      ease: EASE.out,
      stagger: amount,
      ...rest,
    }
  );
}
