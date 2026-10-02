"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Target01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ObjectiveStatusIndicator } from "@/components/issue-indicators";
import type { Objective } from "@/lib/types";

/** Objectives have a named, colored target rather than an issue identifier. */
export function RelationObjectiveLabel({
  objective,
}: {
  objective: Objective;
}) {
  const t = useTranslations("Relations");
  return (
    <>
      <HugeiconsIcon
        icon={Target01Icon}
        className="size-4 shrink-0"
        style={{ color: objective.color ?? "var(--muted-foreground)" }}
        aria-hidden
      />
      <span className="sr-only">{t("objectives")}: </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="min-w-0 flex-1 truncate text-sm">{objective.name}</span>
        </TooltipTrigger>
        <TooltipContent>{objective.name}</TooltipContent>
      </Tooltip>
      <ObjectiveStatusIndicator
        status={objective.status}
        className="size-3.5 shrink-0"
      />
    </>
  );
}
