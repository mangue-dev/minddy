"use client";

import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "mangue-ui";
import { Github, Gitlab } from "lucide-react";
import { getRepoProvider } from "@/lib/repo-providers";
import type { Issue } from "@/lib/types";

const PROVIDER_ICON = { github: Github, gitlab: Gitlab } as const;

/**
 * Marque de la forge à côté de l'identifiant d'un ticket importé du dépôt lié
 * (MIN-97) : le survol nomme l'issue distante, le clic l'ouvre chez le provider.
 * Ne rend rien pour un ticket né dans minddy. Aucune requête : les champs
 * `remote_*` voyagent avec l'issue.
 */
export function RemoteIssueIndicator({
  issue,
  className,
  iconClassName,
}: {
  issue: Issue;
  className?: string;
  iconClassName?: string;
}) {
  const t = useTranslations("IssueUI");
  if (!issue.remote_provider || issue.remote_number == null) return null;

  const provider = getRepoProvider(issue.remote_provider);
  const Icon = PROVIDER_ICON[provider.id];
  const label = t("importedFromForge", {
    provider: provider.displayName,
    number: issue.remote_number,
  });

  const icon = <Icon className={cn("size-3.5", iconClassName)} />;
  const classes = cn(
    "flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground",
    className,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {issue.remote_url ? (
          <a
            href={issue.remote_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className={classes}
            onClick={(e) => e.stopPropagation()}
          >
            {icon}
          </a>
        ) : (
          <span className={classes}>{icon}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
