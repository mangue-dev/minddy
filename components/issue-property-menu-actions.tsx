"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tag01Icon, Target01Icon, UserCircleIcon } from "@hugeicons/core-free-icons";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { PriorityIndicator } from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import {
  EFFORT_OPTION_ICON,
  categoryFieldOptions,
  effortFieldOptions,
  fieldMenuChildren,
  memberFieldOptions,
  objectiveFieldOptions,
  priorityFieldOptions,
  toggleCategory,
} from "@/components/issue-field-options";
import { displayName } from "@/lib/display-name";
import type { IssueEffort, IssuePriority } from "@/lib/issue-constants";
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
        children: fieldMenuChildren("property-priority", priorityFieldOptions(tPriority), {
          isChecked: (value) => issue.priority === value,
          onSelect: (value) => onPatch({ priority: value as IssuePriority }),
        }),
      },
      {
        id: "property-effort",
        label: tField("effort"),
        icon: EFFORT_OPTION_ICON,
        children: [
          {
            id: "property-effort-none",
            label: tField("effortNone"),
            checked: issue.effort === null,
            onSelect: () => onPatch({ effort: null }),
          },
          ...fieldMenuChildren("property-effort", effortFieldOptions(), {
            isChecked: (value) => issue.effort === value,
            onSelect: (value) => onPatch({ effort: value as IssueEffort }),
          }),
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
          ...fieldMenuChildren("property-assignee", memberFieldOptions(members, { avatarClassName: "size-4" }), {
            isChecked: (id) => issue.assignee_id === id,
            onSelect: (id) => onPatch({ assignee_id: id }),
          }),
        ],
      },
    ];
    if (categories.length > 0) {
      actions.push({
        id: "property-categories",
        label: tField("categories"),
        icon: <HugeiconsIcon icon={Tag01Icon} className="size-4" />,
        children: fieldMenuChildren("property-category", categoryFieldOptions(categories), {
          isChecked: (id) => issue.category_ids.includes(id),
          onSelect: (id) => onSetCategories(toggleCategory(issue.category_ids, id)),
          keepOpen: true,
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
          ...fieldMenuChildren("property-objective", objectiveFieldOptions(objectives, { presentation: "menu" }), {
            isChecked: (id) => issue.objective_id === id,
            onSelect: (id) => onPatch({ objective_id: id }),
          }),
        ],
      });
    }
    return actions;
  }, [tField, tPriority, tCommon]);
}
