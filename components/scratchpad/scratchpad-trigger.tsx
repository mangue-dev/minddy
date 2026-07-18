"use client";

import { useTranslations } from "next-intl";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "mangue-ui";
import { NotebookPen } from "lucide-react";
import { useScratchpad } from "@/lib/scratchpad-context";

/** Header entry point for the task notebook (also reachable via ⌘K and the
    `G N` chord). Filled bordered icon button, matching the ⌘K search pill. */
export function ScratchpadTrigger() {
  const t = useTranslations("Scratchpad");
  const { open } = useScratchpad();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("openAria")}
          onClick={open}
          className="rounded-full border border-border bg-card text-muted-foreground shadow-xs hover:bg-card hover:text-foreground"
        >
          <NotebookPen className="size-[18px]" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("open")}</TooltipContent>
    </Tooltip>
  );
}
