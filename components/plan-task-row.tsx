"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { CancelCircleIcon as CircleSlash, CircleIcon, MinusSignIcon, MoreHorizontalIcon, PlayIcon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "mangue-ui";
import { Markdown } from "@/components/markdown";
import type { PlanTask, PlanTaskState } from "@/lib/plan";

/**
 * One checkbox task row, shared by the issue Plan tab (components/issue-plan.tsx)
 * and the personal Notes modal (components/scratchpad/scratchpad-modal.tsx) —
 * both render tasks parsed from the same markdown format (lib/plan.ts).
 *
 * Click on the box toggles done ↔ (back to) to-do; the hover menu reaches every
 * state — four states make click-cycling opaque. The caller owns persistence:
 * `onSetState` receives the requested state and rewrites the source markdown.
 */
export function TaskRow({
  task,
  onSetState,
}: {
  task: PlanTask;
  onSetState: (state: PlanTaskState) => void;
}) {
  const t = useTranslations("Plan");
  const struck = task.state === "completed" || task.state === "cancelled";
  const toggled: PlanTaskState =
    task.state === "completed" || task.state === "cancelled"
      ? "pending"
      : "completed";

  return (
    <div
      className="group/task flex items-start gap-2.5 rounded-md px-1.5 py-1 hover:bg-muted/60"
      style={task.depth > 0 ? { marginLeft: `${task.depth * 1.5}rem` } : undefined}
    >
      <button
        type="button"
        aria-label={t("taskCheckboxAria", { text: task.text })}
        onClick={() => onSetState(toggled)}
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          task.state === "pending" &&
            "border-input hover:border-muted-foreground/60",
          task.state === "in_progress" && "border-primary",
          task.state === "completed" &&
            "border-primary bg-primary text-primary-foreground",
          task.state === "cancelled" &&
            "border-input bg-muted text-muted-foreground"
        )}
      >
        {task.state === "in_progress" && (
          <span className="size-2 rounded-[2px] bg-primary" />
        )}
        {task.state === "completed" && <HugeiconsIcon icon={Tick01Icon} className="size-3" />}
        {task.state === "cancelled" && <HugeiconsIcon icon={MinusSignIcon} className="size-3" />}
      </button>

      <div
        className={cn(
          "min-w-0 flex-1 text-sm leading-relaxed",
          struck && "text-muted-foreground line-through [&_*]:text-muted-foreground"
        )}
      >
        <Markdown className="[&_p]:my-0">{task.text}</Markdown>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("taskMenuAria")}
            className="-my-0.5 size-6 rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/task:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {task.state !== "pending" && (
            <DropdownMenuItem onSelect={() => onSetState("pending")}>
              <HugeiconsIcon icon={CircleIcon} />
              {t("markPending")}
            </DropdownMenuItem>
          )}
          {task.state !== "in_progress" && (
            <DropdownMenuItem onSelect={() => onSetState("in_progress")}>
              <HugeiconsIcon icon={PlayIcon} />
              {t("markInProgress")}
            </DropdownMenuItem>
          )}
          {task.state !== "completed" && (
            <DropdownMenuItem onSelect={() => onSetState("completed")}>
              <HugeiconsIcon icon={Tick01Icon} />
              {t("markCompleted")}
            </DropdownMenuItem>
          )}
          {task.state !== "cancelled" && (
            <DropdownMenuItem onSelect={() => onSetState("cancelled")}>
              <AppIcon icon={CircleSlash} />
              {t("cancelTask")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
