"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, Spinner, cn } from "mangue-ui";
import { CornerDownRight, Target } from "lucide-react";
import { PriorityIndicator, EffortIndicator } from "@/components/issue-indicators";
import type { IssueEffort, IssuePriority } from "@/lib/issue-constants";
import type { SeedIssue, SeedProposal } from "@/lib/seed/types";

/**
 * The primer preview (MIN-172) — the same promise as the import preview:
 * what you see is what is written.
 *
 * Nothing exists yet when this is displayed. Tickets are grouped by
 * objective because that's the shape the pass rendered and that's what
 * "structuring the idea" means; each ticket is unchecked, each title is rewritten, and unchecking an objective takes away its entire project.
 *
 * The state lives in the caller (`project-seed-dialog.tsx`): it is this
 * proposition, the one that the screen shows, which leaves commit.
 */
export function BriefPreview({
  proposal,
  excluded,
  onToggle,
  onRename,
  onCreate,
  creating,
  className,
}: {
  proposal: SeedProposal;
  /** Ticket keys unchecked — the exclusion is said, the selection is deduced. */
  excluded: Set<string>;
  onToggle: (keys: string[], next: boolean) => void;
  onRename: (key: string, title: string) => void;
  onCreate: () => void;
  creating: boolean;
  className?: string;
}) {
  const t = useTranslations("Seed");

  // The groups, in the order of the objectives reached; tickets without construction site
  // bring up the rear rather than being dispersed.
  const groups = useMemo(() => {
    const byKey = new Map<string, SeedIssue[]>();
    const orphans: SeedIssue[] = [];
    // Sub-tickets follow their parent, indented — the template order does not
    // does not guarantee, and a child far from its parent does not read.
    const children = new Map<string, SeedIssue[]>();
    for (const issue of proposal.issues) {
      if (!issue.parentKey) continue;
      const list = children.get(issue.parentKey) ?? [];
      list.push(issue);
      children.set(issue.parentKey, list);
    }
    for (const issue of proposal.issues) {
      if (issue.parentKey) continue;
      const line = [issue, ...(children.get(issue.key) ?? [])];
      if (issue.objectiveKey) {
        byKey.set(issue.objectiveKey, [...(byKey.get(issue.objectiveKey) ?? []), ...line]);
      } else {
        orphans.push(...line);
      }
    }
    return [
      ...proposal.objectives
        .map((objective) => ({
          key: objective.key,
          name: objective.name,
          summary: objective.summary,
          issues: byKey.get(objective.key) ?? [],
        }))
        .filter((group) => group.issues.length > 0),
      ...(orphans.length > 0
        ? [{ key: "", name: t("noObjective"), summary: "", issues: orphans }]
        : []),
    ];
  }, [proposal, t]);

  const selectedCount = proposal.issues.length - excluded.size;
  const selectedObjectives = groups.filter(
    (group) => group.key && group.issues.some((issue) => !excluded.has(issue.key))
  ).length;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="font-normal">
          {t("countIssues", { count: selectedCount })}
        </Badge>
        {selectedObjectives > 0 && (
          <Badge variant="secondary" className="font-normal">
            {t("countObjectives", { count: selectedObjectives })}
          </Badge>
        )}
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const keys = group.issues.map((issue) => issue.key);
            const kept = keys.filter((key) => !excluded.has(key));
            return (
              <section key={group.key || "__none"} className="flex flex-col gap-1">
                <label className="flex items-start gap-2 rounded-md px-1 py-1">
                  <Checkbox
                    className="mt-0.5"
                    checked={
                      kept.length === keys.length
                        ? true
                        : kept.length === 0
                          ? false
                          : "indeterminate"
                    }
                    onCheckedChange={(next) => onToggle(keys, next === true)}
                    disabled={creating}
                    aria-label={group.name}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {group.key ? (
                        <Target className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      ) : null}
                      {group.name}
                    </span>
                    {group.summary && (
                      <span className="text-xs text-muted-foreground">{group.summary}</span>
                    )}
                  </span>
                </label>

                {/* The tickets are aligned under the NAME of their site, not
 under its box: it is this offset that makes the group
 read as a group. */}
                <ul className="flex flex-col pl-6">
                  {group.issues.map((issue) => (
                    <IssueRow
                      key={issue.key}
                      issue={issue}
                      checked={!excluded.has(issue.key)}
                      disabled={creating}
                      onToggle={(next) =>
                        onToggle(
                          // Unchecking a parent takes away its sub-tickets: one
                          // orphan child would be written flat, which is not
                          // what the gesture meant.
                          issue.parentKey
                            ? [issue.key]
                            : [
                                issue.key,
                                ...group.issues
                                  .filter((child) => child.parentKey === issue.key)
                                  .map((child) => child.key),
                              ],
                          next
                        )
                      }
                      onRename={(title) => onRename(issue.key, title)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <Button type="button" onClick={onCreate} disabled={creating || selectedCount === 0}>
          {creating && <Spinner />}
          {t("createButton", { count: selectedCount })}
        </Button>
        <p className="text-xs text-muted-foreground">{t("createHint")}</p>
      </div>
    </div>
  );
}

function IssueRow({
  issue,
  checked,
  disabled,
  onToggle,
  onRename,
}: {
  issue: SeedIssue;
  checked: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
  onRename: (title: string) => void;
}) {
  const t = useTranslations("Seed");
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-md px-1 py-1 transition-opacity hover:bg-muted/40",
        issue.parentKey && "ml-5",
        !checked && "opacity-45"
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onToggle(next === true)}
        disabled={disabled}
        aria-label={issue.title}
      />
      {issue.parentKey && (
        <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      {/* The title is edited where it reads: no mode, no dialog — the
 field only has a border at the focus. */}
      <input
        value={issue.title}
        onChange={(e) => onRename(e.target.value)}
        disabled={disabled || !checked}
        aria-label={t("titleLabel")}
        className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none transition-colors hover:border-border focus:border-ring focus:ring-3 focus:ring-ring/50 disabled:cursor-default disabled:hover:border-transparent"
      />
      <PriorityIndicator priority={issue.priority as IssuePriority} className="shrink-0" />
      {issue.effort ? (
        <EffortIndicator effort={issue.effort as IssueEffort} className="shrink-0" />
      ) : (
        <span className="w-[42px] shrink-0" aria-hidden />
      )}
    </li>
  );
}
