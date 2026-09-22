import { gsap, DURATION, EASE, prefersReducedMotion } from "./gsap";

/**
 * Animate a number from 0 (or its current value) up to `value`, writing the
 * formatted result into the element's textContent each tick. Used for
 * "Files Indexed", "Code Symbols", etc. on the dashboard.
 */
export function animateCounter(
  el: HTMLElement,
  value: number,
  opts: { duration?: number; formatter?: (n: number) => string } = {}
) {
  const { duration = DURATION.slow, formatter = (n) => Math.round(n).toLocaleString() } = opts;

  if (prefersReducedMotion()) {
    el.textContent = formatter(value);
    return;
  }

  const counter = { value: 0 };
  return gsap.to(counter, {
    value,
    duration,
    ease: EASE.out,
    onUpdate: () => {
      el.textContent = formatter(counter.value);
    },
  });
}
