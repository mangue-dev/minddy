"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

const COLORS = ["var(--primary)", "#f472b6", "#60a5fa", "#34d399", "#fbbf24"];
const PIECES = 44;

/**
 * A short burst of confetti over the screen, once (MIN-907): the end of the
 * getting-started tour. Decorative, so hidden from assistive technology and
 * left out when the system asks for less motion.
 */
export function ConfettiBurst() {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, index) => {
        // Spread across the top, falling with a little drift and spin.
        const angle = (index / PIECES) * Math.PI * 2;
        return {
          left: 50 + Math.cos(angle) * 8,
          drift: Math.cos(angle) * (90 + (index % 5) * 30),
          rise: 120 + (index % 7) * 25,
          fall: 520 + (index % 6) * 60,
          rotate: (index % 2 ? 1 : -1) * (180 + (index % 4) * 90),
          delay: (index % 8) * 0.02,
          color: COLORS[index % COLORS.length],
          size: 6 + (index % 3) * 2,
        };
      }),
    [],
  );

  if (reduce) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[46] overflow-hidden">
      {pieces.map((piece, index) => (
        <motion.span
          key={index}
          className="absolute top-[38%] rounded-[2px]"
          style={{ left: `${piece.left}%`, width: piece.size, height: piece.size * 0.6, background: piece.color }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{
            x: piece.drift,
            y: [0, -piece.rise, piece.fall],
            rotate: piece.rotate,
            opacity: [1, 1, 0],
          }}
          transition={{ duration: 1.8, delay: piece.delay, ease: ["easeOut", "easeIn"], times: [0, 0.3, 1] }}
        />
      ))}
    </div>
  );
}
