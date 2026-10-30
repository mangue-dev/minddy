"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Link02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { RelationIcon } from "@/components/issue-indicators";
import { relationToneClass } from "@/components/relation-rows";
import { useRelationPalettePicker } from "@/components/palette-picker-rows";
import { SearchMenu } from "@/components/search-menu";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { useOrderedObjectives } from "@/lib/use-ordered-objectives";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { issueIdentifier } from "@/lib/issue-constants";
import { orderIssuesForSearch } from "@/lib/issue-search-order";
import { RELATION_TYPES, closedObjectivesLast } from "@/lib/relation-constants";
import {
  HIERARCHY_RELATIONS,
  hierarchyCandidates,
  isHierarchyRelation,
  type RelationMenuKind,
} from "@/lib/issue-hierarchy";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import type { PendingRelationInput } from "@/lib/types";

type CreationRelationsProps = {
  projectId: string;
  projectKey: string;
  active: boolean;
  value: PendingRelationInput[];
  onChange: (relations: PendingRelationInput[]) => void;
  disabled?: boolean;
};

type CreationRelationsCompactProps = CreationRelationsProps & {
  /** Controlled picker, so a dialog's R shortcut can open it (MIN-749). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Key badge next to the tooltip, where the dialog handles that key. */
  shortcutHint?: string;
  /** A new issue also offers Parent of / Sub-issue of (MIN-844). */
  hierarchy?: boolean;
  /** Opens straight on this type's targets, skipping the type dropdown (a
   *  type already chosen in Smart Fill's menu). */
  startStep?: RelationMenuKind | null;
};

/**
 * The relation types a creation form can still add: every relation, and with
 * `hierarchy` the parent / sub-issue entries the one-level rule leaves
 * (MIN-804) — one parent, or sub-issues, never both.
 */
export function creationRelationKinds(value: readonly PendingRelationInput[], hierarchy: boolean): RelationMenuKind[] {
  const chosenParent = value.some((r) => r.type === "sub_issue_of");
  const chosenChildren = value.some((r) => r.type === "parent_of");
  const hierarchyTypes = hierarchy
    ? HIERARCHY_RELATIONS.filter((kind) => (kind === "parent_of" ? !chosenParent : !chosenParent && !chosenChildren))
    : [];
  return [...RELATION_TYPES, ...hierarchyTypes];
}

/** Stands for the issue being created in the one-level nesting rules. */
const NEW_ISSUE_ID = "new-issue";

/** Draft-only picker: no relation is written until creation succeeds. */
export function CreationRelationsCompact({
  projectId,
  projectKey,
  active,
  value,
  onChange,
  disabled,
  open: openProp,
  onOpenChange,
  shortcutHint,
  hierarchy = false,
  startStep = null,
}: CreationRelationsCompactProps) {
  const t = useTranslations("Relations");
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const openRef = useRef(open);
  openRef.current = open;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    if (next !== openRef.current) onOpenChange?.(next);
  };
  const [step, setStep] = useState<RelationMenuKind | null>(() => (open ? startStep : null));
  // A type chosen elsewhere opens its targets directly.
  useEffect(() => {
    if (open && startStep) setStep(startStep);
  }, [open, startStep]);
  // The type chosen in the dropdown, handed to the palette once the dropdown
  // has closed: opened earlier, the palette would lose its focus to the
  // dropdown's exit.
  const [chosen, setChosen] = useState<RelationMenuKind | null>(null);
  const { issues, loading: issuesLoading } = useIssuesQuery(
    active && open ? projectId : null,
  );
  const { objectives, loading: objectivesLoading } = useObjectivesQuery(
    active && open ? projectId : null,
  );
  // Picker order (MIN-785): open objectives first, the most recently fed ahead.
  const orderedObjectives = useOrderedObjectives(objectives);

  const resetPicker = () => {
    setOpen(false);
    setStep(null);
    setChosen(null);
  };
  // Reset on a new dialog or project, not on mount: R mounts this picker
  // already open while Smart Fill hides it (MIN-749).
  const scope = `${active}:${projectId}`;
  const scopeRef = useRef(scope);
  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    setOpen(false);
    setStep(null);
    setChosen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on a scope change only; `setOpen` reads the latest state through a ref.
  }, [scope]);

  const linked = (id: string, type: "issue" | "objective") =>
    value.some((r) =>
      r.type === step && r.target_id === id && r.target_type === type,
    );
  const kinds = creationRelationKinds(value, hierarchy);
  // Work under way first, triage last (MIN-726).
  const issueCandidates = useMemo(() => {
    const taken = new Set(value.filter((r) => r.type === step && r.target_type === "issue").map((r) => r.target_id));
    const projectIssues = issues.filter((i) => i.project_id === projectId && !taken.has(i.id));
    const eligible = isHierarchyRelation(step)
      ? hierarchyCandidates(step, [{ id: NEW_ISSUE_ID, project_id: projectId, parent_id: null }], projectIssues)
      : projectIssues;
    return orderIssuesForSearch(eligible, (i) => i.status);
  }, [issues, projectId, value, step]);
  const objectiveCandidates = useMemo(() => {
    const taken = new Set(value.filter((r) => r.type === step && r.target_type === "objective").map((r) => r.target_id));
    return closedObjectivesLast(orderedObjectives.filter(
      (o) => o.project_id === projectId && !taken.has(o.id),
    ));
  }, [orderedObjectives, projectId, value, step]);
  const select = (
    target_id: string,
    target_type: "issue" | "objective",
    target_label: string,
  ) => {
    if (!step || linked(target_id, target_type)) return;
    onChange([...value, { type: step, target_id, target_type, target_label }]);
    resetPicker();
  };
  const loading = issuesLoading || objectivesLoading;

  // Two steps, both "open" for the dialog (it keeps the control shown while
  // Smart Fill would hide it): the type dropdown, then the ⌘K palette on the
  // targets (MIN-844), above the dialog. Nothing is written until the
  // creation succeeds.
  useRelationPalettePicker(open && active && step ? {
    scope: `creation-relations:${projectId}`,
    step,
    issues: issueCandidates,
    objectives: objectiveCandidates,
    projectKey,
    projectId,
    loading,
    onPickIssue: (_type, issueId, issue) => {
      select(issueId, "issue", `${issueIdentifier(projectKey, issue.number)} ${issue.title}`);
    },
    onPickObjective: (_type, objectiveId, objective) => {
      select(objectiveId, "objective", objective.name);
    },
    onClose: resetPicker,
  } : null);

  // A body portal avoids dialog clipping; the modal popover owns its scroll lock.
  return (
    <SearchMenu
      open={open && active && step === null && chosen === null}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else if (step === null && chosen === null) resetPicker();
      }}
      tooltip={t("addRelationAria")}
      shortcutHint={shortcutHint}
      modal
      onCloseAutoFocus={(event) => {
        if (chosen === null) return;
        event.preventDefault();
        setStep(chosen);
        setChosen(null);
      }}
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label={t("addRelationAria")}
          className={cn(
            "flex items-center gap-1.5 rounded-md p-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:opacity-50 max-sm:p-2",
            value.length > 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <HugeiconsIcon icon={Link02Icon} className="size-[18px]" />
          <span>{t("relations")}</span>
        </button>
      }
    >
      <CommandGroup>
        {kinds.map((type) => (
          <CommandItem
            key={type}
            value={type}
            keywords={[t(`action_${type}`)]}
            onSelect={() => setChosen(type)}
          >
            <RelationIcon relation={type} className="size-4" />
            <span>{t(type)}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    </SearchMenu>
  );
}

/** The chosen relations as removable pills, in the creation form's property
 *  row next to the picker that adds them. */
export function CreationRelationPills({
  projectId,
  projectKey,
  active,
  value,
  onChange,
  disabled,
  className = "flex flex-wrap items-center gap-1.5",
}: CreationRelationsProps & { className?: string }) {
  const t = useTranslations("Relations");
  const tCommon = useTranslations("Common");
  const { issues } = useIssuesQuery(active && value.length > 0 ? projectId : null);
  const { objectives } = useObjectivesQuery(active && value.length > 0 ? projectId : null);
  if (!value.length) return null;
  return (
    <div className={className}>
      {value.map((relation, index) => {
        const issue = relation.target_type === "issue"
          ? issues.find((i) => i.id === relation.target_id) : null;
        const objective = relation.target_type === "objective"
          ? objectives.find((o) => o.id === relation.target_id) : null;
        const label = issue
          ? issueIdentifier(projectKey, issue.number)
          : relation.target_type === "issue"
            ? relation.target_label.split(" ")[0]
            : objective?.name ?? relation.target_label;
        const fullLabel = `${t(relation.type)}: ${label}`;
        return (
          <span
            key={`${relation.type}:${relation.target_type}:${relation.target_id}`}
            aria-label={fullLabel}
            className={cn(
              // The property row's size: same text as its controls, and a
              // remove button large enough to hit.
              "inline-flex h-7 max-w-full items-center gap-1.5 rounded-md pr-1 pl-2 text-sm",
              relationToneClass(relation.type),
              relation.type !== "blocked_by" && relation.type !== "blocks" && "bg-muted",
            )}
          >
            <AppTooltip label={fullLabel}>
              <span className="flex min-w-0 items-center gap-1">
                <RelationIcon relation={relation.type} className="size-3.5" />
                <span className="truncate">{label}</span>
              </span>
            </AppTooltip>
            {!disabled && (
              <AppTooltip label={`${tCommon("remove")}: ${fullLabel}`}>
                <button
                  type="button"
                  aria-label={`${tCommon("remove")}: ${fullLabel}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  className="flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                </button>
              </AppTooltip>
            )}
          </span>
        );
      })}
    </div>
  );
}
