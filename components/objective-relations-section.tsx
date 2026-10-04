"use client";

// Objective relations (MIN-513), the counterpart of the issue side panel's
// RelationsSection on the objective detail page: one row of the key/value
// property table, a link button, and the objective's relations grouped by type
// just under it — each removable. Relations can pair this objective with an
// ISSUE (what does the board's dependency mean for the goal) or with another
// OBJECTIVE ("don't launch B until A lands").
//
// Adding is the same two steps in ONE popover as on a ticket: pick the type,
// then the target among the project's open issues and other objectives.

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Link02Icon } from "@hugeicons/core-free-icons";
import { useAppRouter } from "@/lib/use-app-router";
import { useMemo, useState } from "react";
import { RelationObjectiveLabel } from "@/components/relation-objective-label";
import { useTranslations } from "next-intl";
import {
  Button,
  CommandGroup,
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  toast,
} from "mangue-ui";
import { isClosedStatus, issueIdentifier } from "@/lib/issue-constants";
import {
  RELATION_PRIORITY,
  RELATION_TYPES,
  resolveRelations,
} from "@/lib/relation-constants";
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { RelationIcon, StatusIndicator } from "@/components/issue-indicators";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";
import { SearchMenu } from "@/components/search-menu";
import type { Issue, IssueRelationType, Objective } from "@/lib/types";

export function ObjectiveRelationsSection({
  objective,
  projectId,
  projectKey,
  issues,
  onOpenIssue,
  variant = "panel",
}: {
  objective: Objective;
  projectId: string;
  projectKey: string;
  /** All project issues — the candidate ends and the status hydration. */
  issues: Issue[];
  onOpenIssue?: (issueId: string) => void;
  variant?: "panel" | "board";
}) {
  const router = useAppRouter();
  const t = useTranslations("Relations");
  const tCommon = useTranslations("Common");
  const { relations, addRelation, removeRelation } =
    useIssueRelationsQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);

  const [open, setOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [step, setStep] = useState<IssueRelationType | null>(null);
  const [query, setQuery] = useState("");

  // This objective's relations, resolved from ITS perspective (resolveRelations
  // is entity-agnostic — the id comparison does not care what the entity is),
  // hydrated with the other end and priority-sorted.
  const resolved = useMemo(() => {
    const statusById = new Map(issues.map((i) => [i.id, i.status]));
    const objectiveStatusById = new Map(
      objectives.map((o) => [o.id, o.status]),
    );
    return resolveRelations(
      objective.id,
      relations,
      statusById,
      objectiveStatusById,
    );
  }, [objective.id, relations, issues, objectives]);

  // Candidates: open issues, then the other open objectives (a closed blocker
  // doesn't block — the resolver would mark it spent immediately).
  const linked = useMemo(
    () =>
      new Set(
        resolved.filter((r) => r.relation === step).map((r) => r.otherId),
      ),
    [resolved, step],
  );
  const issueCandidates = useMemo(
    () => issues.filter((i) => !linked.has(i.id) && !isClosedStatus(i.status)),
    [issues, linked],
  );
  const objectiveCandidates = useMemo(
    () =>
      objectives.filter(
        (o) =>
          o.id !== objective.id &&
          !linked.has(o.id) &&
          o.status !== "done" &&
          o.status !== "canceled",
      ),
    [objectives, objective.id, linked],
  );

  const grouped = useMemo(
    () =>
      RELATION_PRIORITY.map((type) => ({
        type,
        items: resolved.filter((r) => r.relation === type),
      })).filter((g) => g.items.length > 0),
    [resolved],
  );

  const close = () => {
    setOpen(false);
    setStep(null);
    setQuery("");
  };

  const content = (
    <>
      <PropertyRow label={t("relations")}>
        <SearchMenu
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setStep(null);
              setQuery("");
            }
          }}
          align="end"
          tooltip={t("addRelationAria")}
          searchValue={query}
          onSearchValueChange={setQuery}
          searchPlaceholder={step ? t("searchTarget") : undefined}
          contentClassName="w-80"
          trigger={
            <button
              type="button"
              aria-label={t("addRelationAria")}
              className={cn(TRIGGER, "text-muted-foreground")}
            >
              <HugeiconsIcon icon={Link02Icon} className="size-4" />
            </button>
          }
        >
          {step === null ? (
            <CommandGroup heading={t("relations")}>
              {RELATION_TYPES.map((type) => (
                <CommandItem
                  key={type}
                  value={type}
                  keywords={[t(`action_${type}`)]}
                  onSelect={() => {
                    setStep(type);
                    setQuery("");
                  }}
                >
                  <RelationIcon relation={type} className="size-4" />
                  <span className="truncate">{t(type)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : (
            <>
              <CommandGroup heading={t(`pick_${step}`)}>
                {issueCandidates.map((candidate) => {
                  const id = issueIdentifier(projectKey, candidate.number);
                  return (
                    <CommandItem
                      key={candidate.id}
                      value={candidate.id}
                      keywords={[id, candidate.title]}
                      onSelect={() => {
                        void addRelation(objective.id, step, candidate.id, {
                          sourceType: "objective",
                        }).catch((err) => toast.error((err as Error).message));
                        close();
                      }}
                    >
                      <StatusIndicator
                        status={candidate.status}
                        className="size-4"
                      />
                      <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {id}
                      </span>
                      <span className="truncate">{candidate.title}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {objectiveCandidates.length > 0 && (
                <CommandGroup heading={t("objectives")}>
                  {objectiveCandidates.map((candidate) => (
                    <CommandItem
                      key={candidate.id}
                      value={candidate.id}
                      keywords={[candidate.name]}
                      onSelect={() => {
                        void addRelation(objective.id, step, candidate.id, {
                          sourceType: "objective",
                          targetType: "objective",
                        }).catch((err) => toast.error((err as Error).message));
                        close();
                      }}
                    >
                      <RelationObjectiveLabel objective={candidate} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </SearchMenu>
      </PropertyRow>

      {grouped.length > 0 && (
        <div className="flex flex-col gap-3 pb-2">
          {grouped.map((group) => (
            <div key={group.type}>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <RelationIcon relation={group.type} className="size-3.5" />
                {t(group.type)}{" "}
                <span className="tabular-nums">{group.items.length}</span>
              </div>
              <div className="flex flex-col">
                {group.items.map((r) => {
                  const isObjective = r.otherType === "objective";
                  const otherObjective = isObjective
                    ? objectives.find((o) => o.id === r.otherId)
                    : undefined;
                  const otherIssue = isObjective
                    ? undefined
                    : issues.find((i) => i.id === r.otherId);
                  return (
                    <div
                      key={r.id}
                      className="group/relrow flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setBoardOpen(false);
                          if (isObjective)
                            router.push(
                              `/projects/${projectId}/objectives?open=${r.otherId}`,
                            );
                          else if (onOpenIssue) onOpenIssue(r.otherId);
                          else
                            router.push(
                              `/projects/${projectId}?issue=${r.otherId}`,
                            );
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {isObjective && otherObjective ? (
                          <RelationObjectiveLabel objective={otherObjective} />
                        ) : (
                          <>
                            {otherIssue && (
                              <StatusIndicator
                                status={otherIssue.status}
                                className="size-4 shrink-0"
                              />
                            )}
                            {otherIssue && (
                              <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                                {issueIdentifier(projectKey, otherIssue.number)}
                              </span>
                            )}
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-sm",
                                otherIssue?.status === "done" &&
                                  "text-muted-foreground line-through",
                              )}
                            >
                              {otherIssue?.title}
                            </span>
                          </>
                        )}
                        {r.resolved && (
                          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
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
                          void Promise.resolve(removeRelation(r.id)).catch(
                            (err) => toast.error((err as Error).message),
                          )
                        }
                      >
                        <HugeiconsIcon icon={Cancel01Icon} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
  if (variant === "panel") return content;
  const activeGroups = grouped
    .map((group) => ({
      ...group,
      items: group.items.filter((r) => !r.resolved),
    }))
    .filter((group) => group.items.length);
  const blocked = resolved.some(
    (r) => r.relation === "blocked_by" && !r.resolved,
  );
  return (
    <Popover open={boardOpen} onOpenChange={setBoardOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("relations")}
        >
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full",
              blocked ? "bg-red-500/10" : "bg-muted",
            )}
          >
            {blocked ? (
              <RelationIcon relation="blocked_by" className="size-3.5" />
            ) : (
              <HugeiconsIcon
                icon={Link02Icon}
                className="size-3.5 text-muted-foreground"
              />
            )}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[11px] text-muted-foreground">
              {t("relations")}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                blocked && "text-red-600 dark:text-red-400",
              )}
            >
              {activeGroups.length
                ? activeGroups
                    .map((group) => `${t(group.type)} ${group.items.length}`)
                    .join(" · ")
                : resolved.length
                  ? t("resolved")
                  : t("empty")}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-3">
        <div className="max-h-96 overflow-y-auto">
          {content}
          {!resolved.length && (
            <p className="py-2 text-sm text-muted-foreground">{t("empty")}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
