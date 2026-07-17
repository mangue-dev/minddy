"use client";

import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { NotebookPen } from "lucide-react";
import { useScratchpad } from "@/lib/scratchpad-context";

/** Header entry point for the personal Notes modal (also reachable via ⌘K and
    the `G N` chord). */
export function ScratchpadTrigger() {
  const t = useTranslations("Scratchpad");
  const { open } = useScratchpad();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("openAria")}
      title={t("openAria")}
      onClick={open}
      className="rounded-full text-muted-foreground hover:text-foreground"
    >
      <NotebookPen className="size-[18px]" />
    </Button>
  );
}
