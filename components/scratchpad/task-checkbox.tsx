"use client";

// THE checkbox for a task — that of the notebook and that of a page.
//
// It lives here, next to the shared schema (task-nodes.ts), and not in one of the
// two views: the four states of the plan (`[ ]` / `[~]` / `[x]` / `[-]`) are a
// product vocabulary, and two drawings of the same vocabulary, these are two
// products. The notebook and the pages only differ in what they add
// AROUND — the notebook menu launches an agent, which makes no sense in a
// document.
//
// `cx` and not `cn`: this view is mounted by the page block register,
// which must remain importable outside the browser (see lib/cx.ts).

import { Check, Minus } from "lucide-react";
import { cx } from "@/lib/cx";
import type { PlanTaskState } from "@/lib/plan";

/**
 * The height of ONE line of text (`leading-relaxed` over `text-sm`): the checkbox
 * and the menu center on it, no matter what the text does next by moving to
 * the line. This is what keeps them on the BASELINE of the first line rather
 * than on the top of the block.
 */
export const TASK_LINE = "flex h-[1.625rem] shrink-0 items-center";

/** Is the text of a task crossed out? Completed and canceled, not the others. */
export function taskStruck(state: PlanTaskState): boolean {
  return state === "completed" || state === "cancelled";
}

export function TaskCheckbox({
  state,
  label,
  onToggle,
  className,
}: {
  state: PlanTaskState;
  /** What the screen reader announces — the text of the task, to the caller. */
  label: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      // `preventDefault` to `mousedown`: without it the caret is placed in the
      // button and the next keystroke writes next to the task text.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={cx(
        "flex size-4 items-center justify-center rounded-[4px] border transition-colors",
        state === "pending" && "border-input hover:border-muted-foreground/60",
        state === "in_progress" && "border-primary",
        state === "completed" && "border-primary bg-primary text-primary-foreground",
        state === "cancelled" && "border-input bg-muted text-muted-foreground",
        className
      )}
    >
      {state === "in_progress" && (
        <span className="size-2 rounded-[2px] bg-primary" />
      )}
      {state === "completed" && <Check className="size-3" />}
      {state === "cancelled" && <Minus className="size-3" />}
    </button>
  );
}
