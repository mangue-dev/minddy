"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn, Popover, PopoverContent, PopoverTrigger } from "mangue-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { Target01Icon } from "@hugeicons/core-free-icons";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  RELATION_PRIORITY,
  type DisplayRelation,
} from "@/lib/relation-constants";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RelationIcon } from "@/components/issue-indicators";

export type ChipRelation = DisplayRelation;
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Group dependencies by direction so identifiers never compete with them for space. */
export function RelationChips({
  relations,
  projectKey,
  onOpen,
  onOpenObjective,
  className,
}: {
  relations: ChipRelation[];
  projectKey: string;
  onOpen?: (issueId: string) => void;
  onOpenObjective?: (objectiveId: string) => void;
  className?: string;
}) {
  const t = useTranslations("Relations");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const active = relations.filter((r) => !r.resolved);
  if (!active.length) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
        className,
      )}
      onClick={stop}
      onPointerDown={stop}
    >
      {RELATION_PRIORITY.map((type) => {
        const items = active.filter((r) => r.relation === type);
        if (!items.length) return null;
        const targets = items.slice(0, 3).map((r) =>
          r.otherType === "objective"
            ? r.otherName ?? t("objectives")
            : issueIdentifier(projectKey, r.otherNumber ?? 0),
        ).join(", ");
        const label = `${t(type)} ${targets}${items.length > 3 ? ` +${items.length - 3}` : ""}`;
        return (
          <Popover
            key={type}
            open={expanded === type}
            onOpenChange={(open) => setExpanded(open ? type : null)}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                      type === "blocked_by"
                        ? "bg-red-500/10 text-red-600 dark:text-red-400"
                        : type === "blocks"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground",
                    )}
                  >
                    <RelationIcon relation={type} className="size-3" />
                    <span>{items.length}</span>
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
            <PopoverContent
              align="start"
              className="w-80 max-w-[calc(100vw-2rem)] p-2"
              onClick={stop}
              onPointerDown={stop}
            >
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {t(type)}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {items.map((r) => {
                  const isObjective = r.otherType === "objective";
                  const identifier = isObjective
                    ? null
                    : issueIdentifier(projectKey, r.otherNumber ?? 0);
                  const name = r.otherName ?? identifier ?? t("objectives");
                  const open = isObjective ? onOpenObjective : onOpen;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={!open}
                      onClick={() => {
                        setExpanded(null);
                        open?.(r.otherId);
                      }}
                      className="flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-100"
                    >
                      {isObjective && (
                        <HugeiconsIcon
                          icon={Target01Icon}
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        />
                      )}
                      {identifier && (
                        <span className="shrink-0 whitespace-nowrap font-mono text-xs leading-5 text-muted-foreground">
                          {identifier}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate">{name}</span>
                          </TooltipTrigger>
                          <TooltipContent>{name}</TooltipContent>
                        </Tooltip>
                        {r.inheritedObjectiveName && (
                          <span className="block whitespace-normal text-xs leading-relaxed text-muted-foreground">
                            {t("viaObjective", {
                              name: r.inheritedObjectiveName,
                            })}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </span>
  );
}
