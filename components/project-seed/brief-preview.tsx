"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, Spinner, cn } from "mangue-ui";
import { CornerDownRight, Target } from "lucide-react";
import { PriorityIndicator, EffortIndicator } from "@/components/issue-indicators";
import type { IssueEffort, IssuePriority } from "@/lib/issue-constants";
import type { SeedIssue, SeedProposal } from "@/lib/seed/types";

/**
 * L'aperçu de l'amorce (MIN-172) — la même promesse que l'aperçu d'import :
 * ce qu'on voit est ce qui est écrit.
 *
 * Rien n'existe encore quand ceci s'affiche. Les tickets sont groupés par
 * objectif parce que c'est la forme que la passe a rendue et que c'est ce que
 * « structurer l'idée » veut dire ; chaque ticket se décoche, chaque titre se
 * réécrit, et décocher un objectif emporte son chantier entier.
 *
 * L'état vit chez l'appelant (`project-seed-dialog.tsx`) : c'est cette
 * proposition-là, celle que l'écran montre, qui part au commit.
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
  /** Clés des tickets décochés — l'exclusion se dit, la sélection se déduit. */
  excluded: Set<string>;
  onToggle: (keys: string[], next: boolean) => void;
  onRename: (key: string, title: string) => void;
  onCreate: () => void;
  creating: boolean;
  className?: string;
}) {
  const t = useTranslations("Seed");

  // Les groupes, dans l'ordre des objectifs rendus ; les tickets sans chantier
  // ferment la marche plutôt que d'être dispersés.
  const groups = useMemo(() => {
    const byKey = new Map<string, SeedIssue[]>();
    const orphans: SeedIssue[] = [];
    // Les sous-tickets suivent leur parent, indentés — l'ordre du modèle ne le
    // garantit pas, et un enfant loin de son parent ne se lit pas.
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

                {/* Les tickets s'alignent sous le NOM de leur chantier, pas
                    sous sa case : c'est ce décalage qui fait lire le groupe
                    comme un groupe. */}
                <ul className="flex flex-col pl-6">
                  {group.issues.map((issue) => (
                    <IssueRow
                      key={issue.key}
                      issue={issue}
                      checked={!excluded.has(issue.key)}
                      disabled={creating}
                      onToggle={(next) =>
                        onToggle(
                          // Décocher un parent emporte ses sous-tickets : un
                          // enfant orphelin s'écrirait à plat, ce qui n'est pas
                          // ce que le geste voulait dire.
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
      {/* Le titre s'édite là où il se lit : pas de mode, pas de dialog — le
          champ n'a de bordure qu'au focus. */}
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
