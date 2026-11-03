"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/**
 * WCAG 2.2.2: the landing's figures loop on their own for as long as they are
 * on screen, so a visitor can stop them. One switch for the whole page: the
 * visitor who pauses one figure does not want the next one to start moving.
 * Each figure freezes where it is, unlike reduced motion, which shows a still
 * frame chosen in advance.
 */
let paused = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the visitor paused the landing's looping figures. */
export function useLandingMotionPaused(): boolean {
  return useSyncExternalStore(subscribe, () => paused, () => false);
}

function setPaused(next: boolean) {
  paused = next;
  for (const listener of listeners) listener();
}

/** The pause / play switch shown on a looping figure; hidden under reduced motion, where nothing moves. */
export function MotionPauseButton({ className }: { className?: string }) {
  const t = useTranslations("Landing");
  const isPaused = useLandingMotionPaused();
  const label = isPaused ? t("playAnimations") : t("pauseAnimations");
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => setPaused(!isPaused)}
      className={cn(
        "pointer-events-auto inline-flex size-9 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:hidden",
        className,
      )}
    >
      <HugeiconsIcon icon={isPaused ? PlayIcon : PauseIcon} className="size-4" aria-hidden />
    </button>
  );
}
