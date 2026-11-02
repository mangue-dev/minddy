"use client";

import {
  Children,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

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

/**
 * The figure's own step for the current scene. `ranges[i]` lists the first and
 * last steps of scene `i`; the steps of a scene are spread evenly over its
 * duration, and the last one holds until the scene ends.
 */
export function useSceneStep(ranges: readonly (readonly [number, number])[]): number {
  const { scene, elapsed, sceneMs } = useContext(SceneContext);
  const [first, last] = ranges[Math.min(scene, ranges.length - 1)];
  const count = last - first + 1;
  // The last step gets a longer share, so the scene ends on its result.
  const share = Math.min(1, elapsed / (sceneMs * 0.8));
  return Math.min(last, first + Math.floor(share * count));
}

/** Shows the child that matches the current scene, cross-faded. */
export function SceneSwitch({ children }: { children: ReactNode }) {
  const { scene } = useContext(SceneContext);
  const items = Children.toArray(children);
  const index = Math.min(scene, items.length - 1);
  return (
    <div className="relative h-full">
      <AnimatePresence initial={false}>
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          {items[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

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
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [scene, setScene] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const running = visible && !reduced;

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
      </div>
    </div>
  );
}
