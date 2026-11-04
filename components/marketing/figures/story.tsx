"use client";

import {
  createContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MotionPauseButton, useLandingMotionPaused } from "./motion-pause";

/**
 * A chapter figure told in scenes the visitor can pick. The scenes play on
 * their own while the figure is on screen, each with a progress bar; picking
 * one, including an earlier one, restarts the clock from there. Under reduced
 * motion nothing advances: each scene shows its final state until another is
 * picked.
 */

export interface StoryScene {
  title: string;
  body: string;
}

interface SceneClock {
  scene: number;
  /** Milliseconds spent in the current scene. */
  elapsed: number;
  sceneMs: number;
}

/** Outside a stepper a figure shows its first scene, finished. */
const SceneContext = createContext<SceneClock>({ scene: 0, elapsed: Infinity, sceneMs: 1 });

const TICK_MS = 120;

export function StoryStepper({
  scenes,
  label,
  sceneMs = 7000,
  frameClassName,
  children,
}: {
  scenes: readonly StoryScene[];
  /** Accessible name of the scene list. */
  label: string;
  sceneMs?: number;
  /** The figure's backdrop and its fixed height. */
  frameClassName?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const paused = useLandingMotionPaused();
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [scene, setScene] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const running = visible && !reduced && !paused;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setElapsed((value) => value + TICK_MS);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [running, scene]);

  useEffect(() => {
    if (elapsed < sceneMs) return;
    setScene((value) => (value + 1) % scenes.length);
    setElapsed(0);
  }, [elapsed, sceneMs, scenes.length]);

  const pick = (index: number) => {
    setScene(index);
    setElapsed(0);
  };

  const clock: SceneClock = { scene, elapsed: reduced ? Infinity : elapsed, sceneMs };

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-10">
      <ol aria-label={label} className="order-last flex flex-col gap-1 lg:order-first lg:justify-center">
        {scenes.map((item, index) => {
          const active = index === scene;
          return (
            <li key={item.title}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => pick(index)}
                className={cn(
                  "group w-full rounded-xl px-4 py-3.5 text-left transition-colors duration-200",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active ? "bg-muted/60" : "hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "block text-base font-medium tracking-tight transition-colors",
                    !active && "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {item.title}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-sm leading-relaxed text-pretty text-muted-foreground transition-opacity",
                    !active && "opacity-70",
                  )}
                >
                  {item.body}
                </span>
                <span aria-hidden className="mt-3 block h-0.5 overflow-hidden rounded-full bg-foreground/10">
                  {active && (
                    <span
                      key={`${scene}-${reduced ? "still" : "run"}`}
                      className="story-progress block h-full origin-left rounded-full bg-foreground/60"
                      style={{
                        animationDuration: `${sceneMs}ms`,
                        animationPlayState: running ? "running" : "paused",
                        transform: reduced ? "none" : undefined,
                      }}
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className={cn("relative overflow-hidden select-none", frameClassName)}>
        <SceneContext.Provider value={clock}>{children}</SceneContext.Provider>
        <MotionPauseButton className="absolute right-3 bottom-3 z-10" />
      </div>
    </div>
  );
}
