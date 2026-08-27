"use client";

import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import { NotebookPen } from "lucide-react";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useScratchpadProgress } from "@/lib/use-scratchpad-query";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Header entry point for the task notebook (also reachable via ⌘K and the
    `G N` chord). Filled bordered icon button, matching the ⌘K search pill —
    and, while tasks are still open, a pill carrying how many are left. */
export function ScratchpadTrigger({ onWarm }: { onWarm?: () => void }) {
  const t = useTranslations("Scratchpad");
  const { open } = useScratchpad();
  const { done, total } = useScratchpadProgress();
  // What's still on the list — completed tasks drop out (a badge that never
  // goes down would just be noise), cancelled ones never counted.
  const left = Math.max(total - done, 0);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={left > 0 ? "sm" : "icon-sm"}
          aria-label={
            left > 0
              ? `${t("openAria")} — ${t("tasksLeft", { count: left })}`
              : t("openAria")
          }
          onClick={() => open("click")}
          onPointerEnter={onWarm}
          onFocus={onWarm}
          className={cn(
            "rounded-full border border-border bg-card text-muted-foreground shadow-none hover:bg-card hover:text-foreground",
            left > 0 && "gap-1.5 px-2.5"
          )}
        >
          <NotebookPen className="size-[18px]" />
          {left > 0 && (
            <span className="tabular-nums leading-none">{left}</span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {left > 0 ? `${t("open")} · ${t("tasksLeft", { count: left })}` : t("open")}
      </TooltipContent>
    </Tooltip>
  );
}
