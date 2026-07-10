"use client";

// Side-panel section listing an issue's relations (MIN-25), grouped by type,
// each removable. An inline row of per-type pickers adds new relations (the
// board's right-click menu and the MCP tool are the other entry points).

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button, cn, toast } from "mangue-ui";
import { X } from "lucide-react";
import { isClosedStatus, issueIdentifier } from "@/lib/issue-constants";
import {
  RELATION_PRIORITY,
  RELATION_TYPES,
} from "@/lib/relation-constants";
import { RelationIcon, StatusIndicator } from "@/components/issue-indicators";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import type { ChipRelation } from "@/components/relation-chips";
import type { Issue, IssueRelationType } from "@/lib/types";

export function RelationsSection({
  issue,
  relations,
  allIssues,
  projectKey,
  onOpenIssue,
  onAddRelation,
  onRemoveRelation,
}: {
  issue: Issue;
  /** This issue's relations, resolved (with otherNumber) and priority-sorted. */
  relations: ChipRelation[];
  allIssues: Issue[];
  projectKey: string;
  onOpenIssue: (issueId: string) => void;
  onAddRelation: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string
  ) => void;
  onRemoveRelation: (relationId: string) => void;
}) {
  const t = useTranslations("Relations");
  const tCommon = useTranslations("Common");

  const issueById = useMemo(
    () => new Map(allIssues.map((i) => [i.id, i])),
    [allIssues]
  );

  // Candidates for the add pickers: other OPEN issues not already linked here
  // — relating to done/canceled work is pointless (a closed blocker doesn't
  // block, and the resolver would mark it spent immediately).
  const candidateOptions = useMemo<PickerOption[]>(() => {
    const linked = new Set(relations.map((r) => r.otherId));
    return allIssues
      .filter((i) => i.id !== issue.id && !linked.has(i.id) && !isClosedStatus(i.status))
      .map((i) => {
        const id = issueIdentifier(projectKey, i.number);
        return {
          value: i.id,
          label: `${id} ${i.title}`,
          keywords: [id, i.title],
          icon: <StatusIndicator status={i.status} className="size-4" />,
        };
      });
  }, [allIssues, relations, issue.id, projectKey]);

  const grouped = useMemo(
    () =>
      RELATION_PRIORITY.map((type) => ({
        type,
        items: relations.filter((r) => r.relation === type),
      })).filter((g) => g.items.length > 0),
    [relations]
  );

  const add = (type: IssueRelationType, targetId: string | null) => {
    if (targetId) onAddRelation(issue.id, type, targetId);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">{t("relations")}</span>
        {relations.length > 0 && (
          <span className="text-xs text-muted-foreground">{relations.length}</span>
        )}
      </div>

      {grouped.length > 0 && (
        <div className="mb-3 flex flex-col gap-3">
          {grouped.map((group) => (
            <div key={group.type}>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <RelationIcon relation={group.type} className="size-3.5" />
                {t(group.type)}
              </div>
              <div className="flex flex-col">
                {group.items.map((r) => {
                  const other = issueById.get(r.otherId);
                  const id = issueIdentifier(projectKey, r.otherNumber);
                  return (
                    <div
                      key={r.id}
                      className="group/relrow flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenIssue(r.otherId)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {other && (
                          <StatusIndicator
                            status={other.status}
                            className="size-4 shrink-0"
                          />
                        )}
                        <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                          {id}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            other?.status === "done" &&
                              "text-muted-foreground line-through"
                          )}
                        >
                          {other?.title ?? id}
                        </span>
                        {r.resolved && (
                          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {t("resolved")}
                          </span>
                        )}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tCommon("remove")}
                        className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/relrow:opacity-100 focus-visible:opacity-100"
                        onClick={() =>
                          void Promise.resolve(onRemoveRelation(r.id)).catch(
                            (err) => toast.error((err as Error).message)
                          )
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add: one picker per relation type. */}
      <div className="flex flex-wrap gap-1.5">
        {RELATION_TYPES.map((type) => (
          <SearchSelect
            key={type}
            value={null}
            onChange={(targetId) => add(type, targetId)}
            options={candidateOptions}
            align="start"
            searchPlaceholder={t("searchIssue")}
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40"
              >
                <RelationIcon relation={type} className="size-3.5" />
                {t(`action_${type}`)}
              </button>
            }
          />
        ))}
      </div>
    </div>
  );
}
