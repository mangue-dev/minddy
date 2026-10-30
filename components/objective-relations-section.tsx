"use client";

// Objective relations (MIN-513), the counterpart of the issue side panel's
// RelationsSection on the objective detail page: one row of the key/value
// property table, a link button, and the objective's relations grouped by type
// just under it — each removable. Relations can pair this objective with an
// ISSUE (what does the board's dependency mean for the goal) or with another
// OBJECTIVE ("don't launch B until A lands").
//
// Adding is the same two steps as on a ticket: pick the type in a dropdown,
// then the target in the ⌘K palette (MIN-844), among the project's open
// issues and other objectives.

import { HugeiconsIcon } from "@hugeicons/react";
import { Link02Icon } from "@hugeicons/core-free-icons";
import { useAppRouter } from "@/lib/use-app-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RelationGroupHeader, RelationRemoveButton, RelationRow } from "@/components/relation-rows";
import { useOrderedObjectives } from "@/lib/use-ordered-objectives";
import { useTranslations } from "next-intl";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { issueIdentifier } from "@/lib/issue-constants";
import { orderIssuesForSearch } from "@/lib/issue-search-order";
import {
  RELATION_PRIORITY,
  RELATION_TYPES,
  resolveRelations,
  closedObjectivesLast,
} from "@/lib/relation-constants";
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { RelationIcon } from "@/components/issue-indicators";
import { useRelationPalettePicker } from "@/components/palette-picker-rows";
import { SearchMenu } from "@/components/search-menu";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { RELATION_SHORTCUT_HINT, RELATION_SHORTCUT_KEY } from "@/components/issue-field-shortcuts";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";
import { eventKey } from "@/lib/keyboard/event-key";
import { hasVisibleOpenDialog } from "@/lib/visible-overlays";
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
  // Removing a relation names its other end and asks first (MIN-743).
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  // Project readers (MIN-693): the relations are listed, never changed.
  const { canWrite } = useProjectCapabilities(projectId);
  const { relations, addRelation, removeRelation } =
    useIssueRelationsQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);

  const [open, setOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [step, setStep] = useState<IssueRelationType | null>(null);

  // R opens the add popover on the objective page (MIN-749), with the rules of
  // the card shortcuts: no modifier, never while typing in a field, never under
  // a dialog. G R stays Pull requests: the keyboard provider consumes an armed
  // chord's second key on the window first. The board banner leaves R to the
  // hovered card.
  const openRef = useRef(open);
  openRef.current = open;
  const relationShortcut = variant === "panel" && canWrite;
  useEffect(() => {
    if (!relationShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (eventKey(e) !== RELATION_SHORTCUT_KEY) return;
      if (openRef.current || isTypingTarget(e.target) || hasVisibleOpenDialog()) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [relationShortcut]);

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

  // Candidates: issues, then the other objectives; closed ones stay eligible
  // and sort last (the resolver shows a closed blocker as spent).
  const linked = useMemo(
    () =>
      new Set(
        resolved.filter((r) => r.relation === step).map((r) => r.otherId),
      ),
    [resolved, step],
  );
  const issueCandidates = useMemo(
    // Work under way first, triage last (MIN-726).
    () => orderIssuesForSearch(issues.filter((i) => !linked.has(i.id)), (i) => i.status),
    [issues, linked],
  );
  // Picker order (MIN-785): the most recently fed objectives first.
  const orderedObjectives = useOrderedObjectives(objectives);
  const objectiveCandidates = useMemo(
    () =>
      closedObjectivesLast(orderedObjectives.filter(
        (o) => o.id !== objective.id && !linked.has(o.id),
      )),
    [orderedObjectives, objective.id, linked],
  );

  const grouped = useMemo(
    () =>
      RELATION_PRIORITY.map((type) => ({
        type,
        items: resolved.filter((r) => r.relation === type),
      })).filter((g) => g.items.length > 0),
    [resolved],
  );

  const close = () => setStep(null);
  // The type chosen in the dropdown, handed to the palette once the dropdown
  // has closed: opened earlier, the palette would lose its focus to the
  // dropdown's exit.
  const pendingStep = useRef<IssueRelationType | null>(null);

  useRelationPalettePicker(step && canWrite ? {
    scope: `objective-relations:${objective.id}`,
    step,
    issues: issueCandidates,
    objectives: objectiveCandidates,
    projectKey,
    projectId,
    onPickIssue: (_type, issueId) => {
      void addRelation(objective.id, step, issueId, {
        sourceType: "objective",
      }).catch((err) => toast.error((err as Error).message));
      close();
    },
    onPickObjective: (_type, objectiveId) => {
      void addRelation(objective.id, step, objectiveId, {
        sourceType: "objective",
        targetType: "objective",
      }).catch((err) => toast.error((err as Error).message));
      close();
    },
    onClose: close,
  } : null);

  const content = (
    <>
      {canWrite && (
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
          <CommandGroup>
            {RELATION_TYPES.map((type) => (
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
              <RelationGroupHeader type={group.type} count={group.items.length} />
              <div className="flex flex-col">
                {group.items.map((r) => {
                  const isObjective = r.otherType === "objective";
                  const otherObjective = isObjective
                    ? objectives.find((o) => o.id === r.otherId)
                    : undefined;
                  const otherIssue = isObjective
                    ? undefined
                    : issues.find((i) => i.id === r.otherId);
                  const identifier = otherIssue ? issueIdentifier(projectKey, otherIssue.number) : null;
                  return (
                    <RelationRow
                      key={r.id}
                      target={isObjective
                        ? { kind: "objective", objective: otherObjective, name: otherObjective?.name ?? "" }
                        : { kind: "issue", status: otherIssue?.status, identifier, title: otherIssue?.title ?? "" }}
                      resolved={r.resolved}
                      onOpen={() => {
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
                      action={canWrite ? (
                        <RelationRemoveButton
                          onClick={() =>
                            setRemoveTarget({
                              id: r.id,
                              name: isObjective
                                ? (otherObjective?.name ?? "")
                                : otherIssue
                                  ? `${identifier} ${otherIssue.title}`
                                  : "",
                            })
                          }
                        />
                      ) : null}
                    />
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
  if (resolved.length === 0) return null;
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
    <>
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
              blocked && "bg-red-500/10",
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
        {/* The scroll box spans the popover's padding: the add trigger keeps
            the sidebar's `-mr-1.5`, which a box at the content edge clipped. */}
        <div className="-mx-3 max-h-96 overflow-y-auto px-3">
          {content}
          {!resolved.length && (
            <p className="py-2 text-sm text-muted-foreground">{t("empty")}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
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
          void Promise.resolve(removeRelation(removeTarget.id)).catch(
            (err) => toast.error((err as Error).message),
          );
        }}
      />
    </>
  );
}
