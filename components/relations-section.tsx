"use client";

// Side-panel relations (MIN-25), rendered as a row of the key/value property
// table — label left, a link button right — with the issue's relations grouped
// by type just under it, each removable.
//
// Adding is two steps: the link button opens a dropdown of relation types,
// and picking one opens the ⌘K palette on the candidate ends (MIN-844) — the
// palette lists content, never the type. Since MIN-513 the candidates mix tickets
// and objectives — a relation can block through an objective, or link one.
// Since MIN-804 the type list also sets the hierarchy (parent of, sub-issue
// of), whose second step lists tickets only.
//
// (The board's card shortcut, its right-click menu and the MCP tool are the
// other entry points.)

import { TruncatedText } from "@/components/ui/truncated-text";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Link02Icon,
  MessageMultiple01Icon,
  Target01Icon,
} from "@hugeicons/core-free-icons";
import { useMemo, useRef, useState } from "react";
import { useAppRouter } from "@/lib/use-app-router";
import { useQuery } from "@tanstack/react-query";
import { RelationObjectiveLabel } from "@/components/relation-objective-label";
import { useOrderedObjectives } from "@/lib/use-ordered-objectives";
import { useTranslations } from "next-intl";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { issueIdentifier } from "@/lib/issue-constants";
import { orderIssuesForSearch } from "@/lib/issue-search-order";
import { RELATION_PRIORITY, RELATION_TYPES } from "@/lib/relation-constants";
import {
  HIERARCHY_RELATIONS,
  hierarchyAvailable,
  hierarchyCandidates,
  isHierarchyRelation,
  type HierarchyRelation,
  type RelationMenuKind,
} from "@/lib/issue-hierarchy";
import {
  FEEDBACK_TO_ISSUE_STATUS,
  type IssueLinkedFeedback,
} from "@/lib/feedback/types";
import { ObjectiveStatusIndicator, RelationIcon, StatusIndicator } from "@/components/issue-indicators";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";
import { RELATION_SHORTCUT_HINT } from "@/components/issue-field-shortcuts";
import { useRelationPalettePicker } from "@/components/palette-picker-rows";
import { SearchMenu } from "@/components/search-menu";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import type { ChipRelation } from "@/components/relation-chips";
import type {
  Issue,
  IssueRelationType,
  Objective,
  RelationEndpointType,
} from "@/lib/types";

export function RelationsSection({
  issue,
  relations,
  allIssues,
  objectives,
  projectKey,
  onOpenIssue,
  onAddRelation,
  onRemoveRelation,
  onSetParent,
  readOnly = false,
  addOpen,
  onAddOpenChange,
}: {
  issue: Issue;
  /** This issue's relations, resolved (with otherNumber) and priority-sorted. */
  relations: ChipRelation[];
  allIssues: Issue[];
  /** The project's objectives — relation targets too, since MIN-513. */
  objectives: Objective[];
  projectKey: string;
  onOpenIssue: (issueId: string) => void;
  onAddRelation: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string,
    kinds?: {
      sourceType?: RelationEndpointType;
      targetType?: RelationEndpointType;
    },
  ) => void;
  onRemoveRelation: (relationId: string) => void;
  /** Sets a parent / sub-issue link (MIN-804); its entries follow the
      relation types when given. */
  onSetParent?: (kind: HierarchyRelation, targetId: string) => void;
  /** Project readers: relations are listed without add or remove controls. */
  readOnly?: boolean;
  /** Controlled type dropdown, so the panel's R shortcut can open it (MIN-749). */
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Relations");
  const tCommon = useTranslations("Common");
  // Removing a relation names its other end and asks first (MIN-743).
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const router = useAppRouter();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = addOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onAddOpenChange?.(next);
  };

  // Loaded HERE rather than passed as prop: the panel opens on a ticket at the
  // times, and moving these zeros down to three lines from the page would require
  // each screen that displays a panel (table, list, cycle, global view) to
  // load them for all his tickets first.
  const { data: feedbackData } = useQuery({
    queryKey: ["issue-feedback", issue.id],
    queryFn: async (): Promise<{ feedback: IssueLinkedFeedback[] }> => {
      const res = await fetch(`/api/issues/${issue.id}/feedback`);
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  const feedback = feedbackData?.feedback ?? [];
  // The type chosen in the dropdown: the palette then lists its targets.
  const [step, setStep] = useState<RelationMenuKind | null>(null);

  const issueById = useMemo(
    () => new Map(allIssues.map((i) => [i.id, i])),
    [allIssues],
  );

  // Candidates: other OPEN ends not already linked here — relating to
  // done/canceled work is pointless (a closed blocker doesn't block, and the
  // resolver would mark it spent immediately). Issues first, objectives after.
  const candidates = useMemo<Issue[]>(() => {
    if (isHierarchyRelation(step)) {
      return orderIssuesForSearch(hierarchyCandidates(step, [issue], allIssues), (i) => i.status);
    }
    const linked = new Set(
      relations
        .filter((r) => !r.inheritedObjectiveId && r.relation === step)
        .map((r) => r.otherId),
    );
    // Work under way first, triage last (MIN-726).
    return orderIssuesForSearch(
      allIssues.filter(
        (i) =>
          i.id !== issue.id && !linked.has(i.id),
      ),
      (i) => i.status,
    );
  }, [allIssues, relations, issue.id, step]);
  // Picker order (MIN-785): the most recently fed objectives first.
  const orderedObjectives = useOrderedObjectives(objectives);
  const objectiveCandidates = useMemo<Objective[]>(() => {
    if (isHierarchyRelation(step)) return [];
    const linked = new Set(
      relations
        .filter((r) => !r.inheritedObjectiveId && r.relation === step)
        .map((r) => r.otherId),
    );
    return orderedObjectives.filter(
      (o) =>
        !linked.has(o.id) && o.status !== "done" && o.status !== "canceled",
    );
  }, [orderedObjectives, relations, step]);

  const grouped = useMemo(
    () =>
      RELATION_PRIORITY.map((type) => ({
        type,
        items: relations.filter((r) => r.relation === type),
      })).filter((g) => g.items.length > 0),
    [relations],
  );

  // The parent / sub-issue entries this ticket may take (MIN-804).
  const hierarchy = onSetParent
    ? HIERARCHY_RELATIONS.filter((kind) => hierarchyAvailable(kind, [issue], allIssues))
    : [];

  const close = () => setStep(null);
  // The type chosen in the dropdown, handed to the palette once the dropdown
  // has closed: opened earlier, the palette would lose its focus to the
  // dropdown's exit.
  const pendingStep = useRef<RelationMenuKind | null>(null);

  useRelationPalettePicker(step && !readOnly ? {
    scope: `issue-relations:${issue.id}`,
    step,
    issues: candidates,
    objectives: objectiveCandidates,
    projectKey,
    projectId: issue.project_id,
    onPickIssue: (kind, targetId) => {
      if (isHierarchyRelation(kind)) onSetParent?.(kind, targetId);
      else onAddRelation(issue.id, kind, targetId);
      close();
    },
    onPickObjective: (kind, objectiveId) => {
      if (!isHierarchyRelation(kind)) {
        onAddRelation(issue.id, kind, objectiveId, { targetType: "objective" });
      }
      close();
    },
    onClose: close,
  } : null);

  return (
    <>
      {!readOnly && (
      <PropertyRow label={t("relations")}>
        <SearchMenu
          open={open}
          onOpenChange={setOpen}
          align="end"
          tooltip={t("addRelationAria")}
          shortcutHint={RELATION_SHORTCUT_HINT}
          onCloseAutoFocus={(event) => {
            const chosen = pendingStep.current;
            if (!chosen) return;
            pendingStep.current = null;
            event.preventDefault();
            setStep(chosen);
          }}
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
          {/* SHORT labels (“Blocks”, “Blocked by”, “Related”): those of the
              section and of the group headers just below. The right-click
              wording (“Mark as blocking…”) stays searchable as keywords. */}
          <CommandGroup heading={t("relations")}>
            {[...RELATION_TYPES, ...hierarchy].map((type) => (
              <CommandItem
                key={type}
                value={type}
                keywords={[t(`action_${type}`)]}
                onSelect={() => {
                  pendingStep.current = type;
                  setOpen(false);
                }}
              >
                <RelationIcon relation={type} className="size-4" />
                <span className="truncate">{t(type)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </SearchMenu>
      </PropertyRow>
      )}

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
                  const objective = isObjective
                    ? objectives.find((o) => o.id === r.otherId)
                    : undefined;
                  const other = issueById.get(r.otherId);
                  const id = isObjective
                    ? null
                    : issueIdentifier(projectKey, r.otherNumber ?? 0);
                  return (
                    <div
                      key={r.id}
                      className="group/relrow flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          isObjective
                            ? router.push(
                                `/projects/${issue.project_id}/objectives?open=${r.otherId}`,
                              )
                            : onOpenIssue(r.otherId)
                        }
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {isObjective && objective ? (
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex min-w-0 items-center gap-2">
                              <RelationObjectiveLabel objective={objective} />
                            </span>
                            {r.inheritedObjectiveName && (
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {t("viaObjective", {
                                  name: r.inheritedObjectiveName,
                                })}
                              </span>
                            )}
                          </span>
                        ) : (
                          <>
                            {other && (
                              <StatusIndicator
                                status={other.status}
                                className="size-4 shrink-0"
                              />
                            )}
                            {id && (
                              <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                                {id}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <TruncatedText
                                text={(isObjective ? r.otherName : (other?.title ?? id)) ?? ""}
                                className={cn(
                                  "truncate text-sm",
                                  other?.status === "done" &&
                                    "text-muted-foreground line-through",
                                )}
                              />
                              {r.inheritedObjectiveName && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {t("viaObjective", {
                                    name: r.inheritedObjectiveName,
                                  })}
                                </span>
                              )}
                            </span>
                          </>
                        )}
                        {r.resolved && (
                          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {t("resolved")}
                          </span>
                        )}
                      </button>
                      {r.inheritedObjectiveId ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                              onClick={() =>
                                router.push(
                                  `/projects/${issue.project_id}/objectives?open=${r.inheritedObjectiveId}`,
                                )
                              }
                              aria-label={t("viaObjective", {
                                name: r.inheritedObjectiveName ?? "",
                              })}
                            >
                              {(() => {
                                // The objective passing the blocker on, by its
                                // real status (MIN-785).
                                const via = objectives.find((o) => o.id === r.inheritedObjectiveId);
                                return via ? (
                                  <ObjectiveStatusIndicator status={via.status} className="size-3.5" />
                                ) : (
                                  <HugeiconsIcon icon={Target01Icon} className="size-3.5" aria-hidden />
                                );
                              })()}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("viaObjective", {
                              name: r.inheritedObjectiveName ?? "",
                            })}
                          </TooltipContent>
                        </Tooltip>
                      ) : readOnly ? null : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={tCommon("remove")}
                          className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/relrow:opacity-100 focus-visible:opacity-100 touch:opacity-100"
                          onClick={() =>
                            setRemoveTarget({
                              id: r.id,
                              name: isObjective
                                ? (r.otherName ?? "")
                                : [id, other?.title].filter(Boolean).join(" "),
                            })
                          }
                        >
                          <HugeiconsIcon icon={Cancel01Icon} />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The feedback from the board that this ticket implements (MIN-196).
 They live in “Relations” because it is one — but in its
 own group, and WITHOUT a cross: the link is undone since the return,
 never from here. A ticket doesn't know how many requests it has, and detaching them from this screen would remove someone from tracking theirs without the screen showing it being in front of them. */}
      {feedback.length > 0 && (
        <div className="flex flex-col pb-2">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <HugeiconsIcon icon={MessageMultiple01Icon} className="size-3.5" />
            {t("linkedFeedback")}
          </div>
          <div className="flex flex-col">
            {feedback.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() =>
                  // The return is processed in the Returns tab, never in this
                  // panel: this is where his thread, his moderation and his
                  // promotion. The sign says it exists and leads to it.
                  router.push(
                    `/projects/${issue.project_id}/feedback?post=${post.id}`,
                  )
                }
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted/60"
              >
                <StatusIndicator
                  status={FEEDBACK_TO_ISSUE_STATUS[post.status]}
                  className="size-4 shrink-0"
                />
                {/* The voices in place of the identifier: a return does not have one,
 and it is its weight which determines whether it should be read. */}
                <span className="w-14 shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {t("votes", { count: post.vote_count })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {post.title}
                </span>
                {post.comment_count > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <HugeiconsIcon
                      icon={MessageMultiple01Icon}
                      className="size-3"
                    />
                    {post.comment_count}
                  </span>
                )}
                {/* A private return is not on the board: saying it here avoids
 having to look for something on a public page that is not there. */}
                {!post.is_public && (
                  <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {t("feedbackPrivate")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      <ConfirmDeleteDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title={t("removeTitle", { name: removeTarget?.name ?? "" })}
        description={t("removeDescription")}
        confirmLabel={tCommon("remove")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => {
          if (!removeTarget) return;
          void Promise.resolve(onRemoveRelation(removeTarget.id)).catch(
            (err) => toast.error((err as Error).message),
          );
        }}
      />
    </>
  );
}
