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
import { HugeiconsIcon } from "@hugeicons/react";
import { MinusSignIcon, CheckIcon } from "@hugeicons/core-free-icons";
import { cx } from "@/lib/cx";
import type { PlanTaskState } from "@/lib/plan";

/**
 * The height of ONE line of the surrounding text (`1lh`): the checkbox and the
 * menu center on it, no matter what the text does next by moving to the line.
 * This is what keeps them on the first line rather than on the top of the
 * block. The unit follows the editor's own scale — a fixed page-sized height
 * left the box below the text of the compact surfaces (plans, descriptions,
 * objectives), whose line is shorter.
 */
export const TASK_LINE = "flex h-[1lh] shrink-0 items-center";

/** Is the text of a task crossed out? Completed and canceled, not the others. */
export function taskStruck(state: PlanTaskState): boolean {
  return state === "completed" || state === "cancelled";
}

export function TaskCheckbox({
  state,
  label,
  onToggle,
  disabled = false,
  className,
}: {
  state: PlanTaskState;
  /** What the screen reader announces — the text of the task, to the caller. */
  label: string;
  onToggle: () => void;
  /** A read-only editor shows the state without changing it. */
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      // `preventDefault` to `mousedown`: without it the caret is placed in the
      // button and the next keystroke writes next to the task text.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={cx(
        "flex size-4 items-center justify-center rounded-[4px] border transition-colors",
        state === "pending" && "border-input enabled:hover:border-muted-foreground/60",
        state === "in_progress" && "border-primary",
        state === "completed" && "border-primary bg-primary text-primary-foreground",
        state === "cancelled" && "border-input bg-muted text-muted-foreground",
        className
      )}
    >
      {state === "in_progress" && (
        <span className="size-2 rounded-[2px] bg-primary" />
      )}
      {state === "completed" && <HugeiconsIcon icon={CheckIcon} className="size-3" />}
      {state === "cancelled" && <HugeiconsIcon icon={MinusSignIcon} className="size-3" />}
    </button>
  );
}
