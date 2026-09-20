"use client";

import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem } from "mangue-ui";
import { CommandAnchor } from "@/components/command-anchor";
import { ObjectiveStatusIndicator, StatusIndicator } from "@/components/issue-indicators";
import { issueIdentifier } from "@/lib/issue-constants";
import type { Issue, IssueRelationType, Objective, RelationEndpointType } from "@/lib/types";

export function RelationTargetPicker({
  position,
  relation,
  issues,
  objectives,
  projectKey,
  onClose,
  onSelect,
}: {
  position: { x: number; y: number } | null;
  relation: IssueRelationType | null;
  issues: Issue[];
  objectives: Objective[];
  projectKey: string;
  onClose: () => void;
  onSelect: (targetId: string, targetType: RelationEndpointType) => void;
}) {
  const t = useTranslations("Relations");
  if (!position || !relation) return null;

  return (
    <CommandAnchor position={position} onClose={onClose}>
      <CommandGroup heading={t(relation)}>
        {issues.map((issue) => {
          const id = issueIdentifier(projectKey, issue.number);
          return (
            <CommandItem
              key={issue.id}
              value={issue.id}
              keywords={[id, issue.title]}
              onSelect={() => {
                onClose();
                onSelect(issue.id, "issue");
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
      {objectives.length > 0 && (
        <CommandGroup heading={t("objectives")}>
          {objectives.map((objective) => (
            <CommandItem
              key={objective.id}
              value={objective.id}
              keywords={[objective.name]}
              onSelect={() => {
                onClose();
                onSelect(objective.id, "objective");
              }}
            >
              <ObjectiveStatusIndicator status={objective.status} className="size-4" />
              <span className="truncate">{objective.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </CommandAnchor>
  );
}
