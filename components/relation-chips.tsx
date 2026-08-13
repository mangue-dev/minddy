"use client";

// Compact relation indicators (MIN-25): an icon + the linked issue's identifier,
// clickable to open it. Shown on the issue card's identifier row and in the side
// panel header. `relations` is expected pre-sorted by RELATION_PRIORITY (see
// resolveRelations), so slicing to `max` keeps the highest-signal one.

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { issueIdentifier } from "@/lib/issue-constants";
import { RelationIcon } from "@/components/issue-indicators";
import type { IssueRelationType } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ChipRelation {
  id: string;
  relation: IssueRelationType;
  otherId: string;
  otherNumber: number;
  /** A blocking relation whose blocker is closed: dropped from the compact chip
      row so the card reads as normal (it stays, marked resolved, in the panel). */
  resolved: boolean;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function RelationChips({
  relations,
  projectKey,
  onOpen,
  max = 1,
  className,
}: {
  relations: ChipRelation[];
  projectKey: string;
  /** Open the linked issue's side panel. Omit to render read-only (drag overlay). */
  onOpen?: (issueId: string) => void;
  /** How many chips to show before collapsing the rest into a "+N". */
  max?: number;
  className?: string;
}) {
  const t = useTranslations("Relations");
  // A resolved blocking relation (its blocker is done/canceled/duplicate) no
  // longer constrains, so the compact card must read as normal — drop resolved
  // relations here. They stay visible, marked resolved, in RelationsSection.
  const active = relations.filter((r) => !r.resolved);
  if (active.length === 0) return null;
  const shown = active.slice(0, max);
  const overflow = active.length - shown.length;

  return (
    <span className={cn("flex items-center gap-1", className)}>
      {shown.map((r) => {
        const id = issueIdentifier(projectKey, r.otherNumber);
        const label = `${t(r.relation)} ${id}`;
        const inner = (
          <>
            <RelationIcon relation={r.relation} className="size-3" />
            <span>{id}</span>
          </>
        );
        return (
          <Tooltip key={r.id}>
            <TooltipTrigger asChild>
              {onOpen ? (
                <button
                  type="button"
                  aria-label={label}
                  onClick={(e) => {
                    stop(e);
                    onOpen(r.otherId);
                  }}
                  onPointerDown={stop}
                  className="-mx-0.5 flex items-center gap-0.5 rounded-sm px-0.5 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted"
                >
                  {inner}
                </button>
              ) : (
                <span className="flex items-center gap-0.5">{inner}</span>
              )}
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
      {overflow > 0 && (
        <span className="text-muted-foreground" aria-hidden>
          +{overflow}
        </span>
      )}
    </span>
  );
}
