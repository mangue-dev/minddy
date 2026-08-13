"use client";

import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { Plug } from "lucide-react";
import { useIntegrationsQuery } from "@/lib/use-integrations-query";
import type { Issue } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Bluish plug shown next to the identifier of integration-created issues;
    hovering names the exact integration. Renders nothing for human issues. */
export function IntegrationIndicator({
  issue,
  className,
  iconClassName,
}: {
  issue: Issue;
  className?: string;
  iconClassName?: string;
}) {
  const t = useTranslations("IssueUI");
  const { integrations } = useIntegrationsQuery(
    issue.integration_id ? issue.project_id : null
  );
  if (!issue.integration_id) return null;
  const name = integrations.find((i) => i.id === issue.integration_id)?.name;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "flex shrink-0 items-center text-blue-500 dark:text-blue-400",
            className
          )}
        >
          <Plug className={cn("size-3.5", iconClassName)} />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {name
          ? t("createdByIntegration", { name })
          : t("createdByIntegrationGeneric")}
      </TooltipContent>
    </Tooltip>
  );
}
