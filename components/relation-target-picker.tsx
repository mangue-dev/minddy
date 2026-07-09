"use client";

// Second step of adding a relation from the card's right-click menu (MIN-25):
// after the user picks a relation type, this searchable popover — anchored at
// the same pointer position — lets them choose the target issue.

import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem } from "mangue-ui";
import { CommandAnchor } from "@/components/command-anchor";
import { StatusIndicator } from "@/components/issue-indicators";
import { issueIdentifier } from "@/lib/issue-constants";
import type { Issue, IssueRelationType } from "@/lib/types";

export function RelationTargetPicker({
  position,
  relation,
  issues,
  projectKey,
  onClose,
  onSelect,
}: {
  /** Viewport coordinates to anchor to; null = closed. */
  position: { x: number; y: number } | null;
  /** The relation being added — drives the placeholder/heading label. */
  relation: IssueRelationType | null;
  /** Candidate issues (self and already-linked issues excluded by the caller). */
  issues: Issue[];
  projectKey: string;
  onClose: () => void;
  onSelect: (issueId: string) => void;
}) {
  const t = useTranslations("Relations");
  if (!position || !relation) return null;

  return (
    <CommandAnchor position={position} onClose={onClose}>
      <CommandGroup heading={t(`pick_${relation}`)}>
        {issues.map((issue) => {
          const id = issueIdentifier(projectKey, issue.number);
          return (
            <CommandItem
              key={issue.id}
              value={issue.id}
              keywords={[id, issue.title]}
              onSelect={() => {
                onClose();
                onSelect(issue.id);
              }}
            >
              <StatusIndicator status={issue.status} className="size-4" />
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {id}
              </span>
              <span className="truncate">{issue.title}</span>
            </CommandItem>
          );
        })}
      </CommandGroup>
    </CommandAnchor>
  );
}
