"use client";

import { RelationObjectiveLabel } from "@/components/relation-objective-label";
import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem } from "mangue-ui";
import { CommandAnchor } from "@/components/command-anchor";
import { SemanticIssueGroup } from "@/components/semantic-issue-group";
import { StatusIndicator } from "@/components/issue-indicators";
import { issueIdentifier } from "@/lib/issue-constants";
import { issueTierKeyword, orderIssuesForSearch } from "@/lib/issue-search-order";
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
  // Work under way first, triage last (MIN-726).
  const ordered = orderIssuesForSearch(issues, (issue) => issue.status);

  return (
    <CommandAnchor position={position} onClose={onClose}>
      <CommandGroup heading={t(relation)}>
        {ordered.map((issue) => {
          const id = issueIdentifier(projectKey, issue.number);
          return (
            <CommandItem
              key={issue.id}
              value={issue.id}
              keywords={[id, issue.title, issueTierKeyword(issue.status)]}
              onSelect={() => {
                onClose();
                onSelect(issue.id, "issue");
              }}
            >
              <StatusIndicator status={issue.status} className="size-4" />
              <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
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
              <RelationObjectiveLabel objective={objective} />
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {/* Same eligible issues, found by meaning (MIN-718). */}
      <SemanticIssueGroup
        projectId={issues[0]?.project_id ?? null}
        candidates={ordered}
        idOf={(issue) => issue.id}
        statusOf={(issue) => issue.status}
        textOf={(issue) => ({ value: issue.id, keywords: [issueIdentifier(projectKey, issue.number), issue.title] })}
        onSelect={(issue) => {
          onClose();
          onSelect(issue.id, "issue");
        }}
        renderItem={(issue) => (
          <>
            <StatusIndicator status={issue.status} className="size-4" />
            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
              {issueIdentifier(projectKey, issue.number)}
            </span>
            <span className="truncate">{issue.title}</span>
          </>
        )}
      />
    </CommandAnchor>
  );
}
