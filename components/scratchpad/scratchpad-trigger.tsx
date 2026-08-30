"use client";

import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import { NotebookPen } from "lucide-react";
import { KbdSequence } from "@/components/ui/kbd";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useScratchpadProgress } from "@/lib/use-scratchpad-query";
import { CHORD_PREFIX } from "@/lib/keyboard/keyboard-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SIDEBAR_ROW_ACTION_CLASS } from "@/lib/sidebar-control-styles";

/** Task-notebook entry point shared by the header and primary sidebar. */
export function ScratchpadTrigger({
  onWarm,
  variant = "header",
}: {
  onWarm?: () => void;
  variant?: "header" | "sidebar";
}) {
  const t = useTranslations("Scratchpad");
  const tk = useTranslations("Keyboard");
  const { open } = useScratchpad();
  const { done, total } = useScratchpadProgress();
  // What's still on the list — completed tasks drop out (a badge that never
  // goes down would just be noise), cancelled ones never counted.
  const left = Math.max(total - done, 0);
  const sidebar = variant === "sidebar";

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
            "shadow-none",
            sidebar
              ? cn(
                  SIDEBAR_ROW_ACTION_CLASS,
                  "gap-1.5 px-[9px] text-sidebar-foreground/70",
                  left === 0 && "size-9",
                )
              : "rounded-full border border-border bg-card text-muted-foreground hover:bg-card hover:text-foreground",
            !sidebar && left > 0 && "gap-1.5 px-2.5"
          )}
        >
          <NotebookPen className={sidebar ? "size-4" : "size-[18px]"} />
          {left > 0 && (
            <span className="tabular-nums leading-none">{left}</span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        <span>{t("open")}</span>
        <KbdSequence
          keys={[[CHORD_PREFIX.toUpperCase()], ["N"]]}
          separator={tk("then")}
          size="sm"
        />
      </TooltipContent>
    </Tooltip>
  );
}
