"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tag01Icon, Target01Icon, TriangleIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { ObjectiveName } from "@/components/objective-label";
import { EffortIndicator, ObjectiveStatusIndicator, PriorityIndicator } from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import { Dot } from "@/components/ui/color-dot";
import { displayName } from "@/lib/display-name";
import { EFFORTS, PRIORITIES } from "@/lib/issue-constants";
import type { Category, Issue, IssueUpdateInput, Member, Objective } from "@/lib/types";

/**
 * An issue's editable properties as right-click submenus — priority, effort,
 * assignee, categories and objective — for lists whose rows are issues
 * outside a board (the triage column). Each entry writes at once; the
 * current value carries a check.
 */
export function useIssuePropertyMenuActions() {
  const tField = useTranslations("Field");
  const tPriority = useTranslations("Priority");
  const tCommon = useTranslations("Common");
  return useCallback(({ issue, members, categories, objectives, onPatch, onSetCategories }: {
    issue: Pick<Issue, "priority" | "effort" | "assignee_id" | "category_ids" | "objective_id">;
    members: readonly Member[];
    categories: readonly Category[];
    objectives: readonly Objective[];
    onPatch: (patch: IssueUpdateInput) => void;
    onSetCategories: (ids: string[]) => void;
  }): ContextMenuAction[] => {
    const assignee = issue.assignee_id ? members.find((m) => m.user_id === issue.assignee_id) ?? null : null;
    const actions: ContextMenuAction[] = [
      {
        id: "property-priority",
        label: tField("priority"),
        icon: <PriorityIndicator priority={issue.priority} className="size-4" />,
        children: PRIORITIES.map((p) => ({
          id: `property-priority-${p.value}`,
          label: tPriority(p.value),
          icon: <PriorityIndicator priority={p.value} className="size-4" />,
          checked: issue.priority === p.value,
          onSelect: () => onPatch({ priority: p.value }),
        })),
      },
      {
        id: "property-effort",
        label: tField("effort"),
        icon: <HugeiconsIcon icon={TriangleIcon} className="size-4" />,
        children: [
          {
            id: "property-effort-none",
            label: tField("effortNone"),
            checked: issue.effort === null,
            onSelect: () => onPatch({ effort: null }),
          },
          ...EFFORTS.map((e) => ({
            id: `property-effort-${e.value}`,
            label: e.label,
            icon: <EffortIndicator effort={e.value} className="size-4" />,
            checked: issue.effort === e.value,
            onSelect: () => onPatch({ effort: e.value }),
          })),
        ],
      },
      {
        id: "property-assignee",
        label: tField("assignee"),
        // The current assignee's face; the person icon when unassigned.
        icon: assignee
          ? <UserAvatar seed={assignee.avatar_seed} title={displayName(assignee)} className="size-4" />
          : <HugeiconsIcon icon={UserCircleIcon} className="size-4" />,
        children: [
          {
            id: "property-assignee-none",
            label: tField("unassigned"),
            checked: issue.assignee_id === null,
            onSelect: () => onPatch({ assignee_id: null }),
          },
          ...members.map((m) => ({
            id: `property-assignee-${m.user_id}`,
            label: displayName(m),
            icon: <UserAvatar seed={m.avatar_seed} title={displayName(m)} className="size-4" />,
            checked: issue.assignee_id === m.user_id,
            onSelect: () => onPatch({ assignee_id: m.user_id }),
          })),
        ],
      },
    ];
    if (categories.length > 0) {
      actions.push({
        id: "property-categories",
        label: tField("categories"),
        icon: <HugeiconsIcon icon={Tag01Icon} className="size-4" />,
        children: categories.map((c) => {
          const on = issue.category_ids.includes(c.id);
          return {
            id: `property-category-${c.id}`,
            label: c.name,
            icon: <Dot color={c.color} />,
            checked: on,
            keepOpen: true,
            onSelect: () => onSetCategories(on
              ? issue.category_ids.filter((id) => id !== c.id)
              : [...issue.category_ids, c.id]),
          };
        }),
      });
    }
    if (objectives.length > 0) {
      actions.push({
        id: "property-objective",
        label: tField("objective"),
        icon: <HugeiconsIcon icon={Target01Icon} className="size-4" />,
        children: [
          {
            id: "property-objective-none",
            label: tCommon("none"),
            checked: issue.objective_id === null,
            onSelect: () => onPatch({ objective_id: null }),
          },
          ...objectives.map((o) => ({
            id: `property-objective-${o.id}`,
            label: o.name,
            labelNode: <ObjectiveName objective={o} />,
            keywords: [o.name],
            icon: <ObjectiveStatusIndicator status={o.status} className="size-4" />,
            checked: issue.objective_id === o.id,
            onSelect: () => onPatch({ objective_id: o.id }),
          })),
        ],
      });
    }
    return actions;
  }, [tField, tPriority, tCommon]);
}
