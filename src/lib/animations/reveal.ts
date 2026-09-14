import { gsap, DURATION, EASE, prefersReducedMotion } from "./gsap";

type Target = gsap.TweenTarget;

/** Fade + rise into place. The default entrance for cards, panels, and
 * dashboard sections. */
export function fadeUp(target: Target, opts: gsap.TweenVars = {}) {
  if (prefersReducedMotion()) return gsap.set(target, { opacity: 1, y: 0 });
  return gsap.fromTo(
    target,
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: DURATION.normal, ease: EASE.out, ...opts }
  );
}

/** Gentle scale-in. Used for graph nodes, modals, and selected states. */
export function scaleIn(target: Target, opts: gsap.TweenVars = {}) {
  if (prefersReducedMotion()) return gsap.set(target, { opacity: 1, scale: 1 });
  return gsap.fromTo(
    target,
    { opacity: 0, scale: 0.96 },
    { opacity: 1, scale: 1, duration: DURATION.fast, ease: EASE.out, ...opts }
  );
}

/** Draw an SVG path in with stroke-dashoffset — used for architecture-graph
 * connection lines and the landing-page hero diagram. */
export function drawLine(path: SVGPathElement, opts: gsap.TweenVars = {}) {
  if (prefersReducedMotion()) {
    gsap.set(path, { strokeDashoffset: 0 });
    return;
  }
  const length = path.getTotalLength();
  gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
  return gsap.to(path, {
    strokeDashoffset: 0,
    duration: DURATION.slow,
    ease: EASE.inOut,
    ...opts,
  });
}
