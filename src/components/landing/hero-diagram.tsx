"use client";

import * as React from "react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion, EASE } from "@/lib/animations";

const NODES = [
  { x: 60, label: "Repository" },
  { x: 220, label: "Indexer" },
  { x: 380, label: "Knowledge Graph" },
  { x: 540, label: "AI" },
  { x: 700, label: "Developer" },
];

export function HeroDiagram() {
  const svgRef = React.useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      if (!svgRef.current) return;
      const paths = svgRef.current.querySelectorAll<SVGPathElement>(".connector");
      const dots = svgRef.current.querySelectorAll<SVGCircleElement>(".node-dot");
      const labels = svgRef.current.querySelectorAll<SVGTextElement>(".node-label");

      if (prefersReducedMotion()) {
        gsap.set([paths, dots, labels], { opacity: 1 });
        gsap.set(paths, { strokeDashoffset: 0 });
        return;
      }

      const tl = gsap.timeline({ delay: 0.2 });
      tl.fromTo(dots, { opacity: 0, scale: 0.6, transformOrigin: "center" }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.12, ease: EASE.out })
        .fromTo(labels, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.12, ease: EASE.out }, "<0.1");

      paths.forEach((p, i) => {
        const length = p.getTotalLength();
        gsap.set(p, { strokeDasharray: length, strokeDashoffset: length });
        tl.to(p, { strokeDashoffset: 0, duration: 0.5, ease: EASE.inOut }, 0.3 + i * 0.12);
      });

      // Gentle looping pulse once the flow has drawn in.
      tl.to(dots, {
        opacity: 0.55,
        duration: 1.6,
        ease: "sine.inOut",
        stagger: { each: 0.2, repeat: -1, yoyo: true },
      });

      return () => {
        tl.kill();
      };
    },
    { scope: svgRef }
  );

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 760 90"
      className="h-auto w-full max-w-3xl text-primary"
      role="img"
      aria-label="Diagram: Repository flows through Indexer and Knowledge Graph into AI, reaching the Developer"
    >
      {NODES.slice(0, -1).map((n, i) => {
        const next = NODES[i + 1];
        const midY = 45;
        return (
          <path
            key={n.label}
            className="connector"
            d={`M ${n.x + 34} ${midY} L ${next.x - 34} ${midY}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeOpacity={0.5}
          />
        );
      })}
      {NODES.map((n) => (
        <g key={n.label}>
          <circle className="node-dot" cx={n.x} cy={45} r={16} fill="none" stroke="currentColor" strokeWidth={1.5} />
          <circle className="node-dot" cx={n.x} cy={45} r={4} fill="currentColor" />
          <text className="node-label" x={n.x} y={78} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fill="currentColor" opacity={0.75}>
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
