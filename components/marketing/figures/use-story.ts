"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useLandingMotionPaused } from "./motion-pause";

/**
 * Steps a looping landing figure forward. The clock only runs while the figure
 * is on screen, and a visitor who asked for reduced motion sees one still
 * frame, `stillStep`, chosen to tell the whole story at once. A visitor who
 * paused the figures (motion-pause.tsx) keeps the current step.
 */
export function useStory(
  length: number,
  {
    stepMs = 2000,
    holdMs = 3200,
    stillStep = length - 1,
  }: { stepMs?: number; holdMs?: number; stillStep?: number } = {},
) {
  const reduced = useReducedMotion();
  const paused = useLandingMotionPaused();
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || paused || !visible) return;
    const last = step === length - 1;
    const id = window.setTimeout(() => setStep(last ? 0 : step + 1), last ? holdMs : stepMs);
    return () => window.clearTimeout(id);
  }, [holdMs, length, paused, reduced, step, stepMs, visible]);

  return { ref, step: reduced ? stillStep : step };
}
