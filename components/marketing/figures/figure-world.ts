"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_CATEGORIES, type DefaultCategoryKey } from "@/lib/default-categories";
import type { IssueCardCategory, IssueCardIssue, Member } from "@/lib/types";

/**
 * The small world the landing figures live in: the demo Aurora workspace,
 * its three teammates and the categories every new project starts with. The
 * figures render real app components, which read members and categories from
 * maps exactly as the board does.
 */

export const FIGURE_PROJECT_KEY = "AUR";
export const FIGURE_PROJECT_ID = "aurora";

function member(user_id: string, full_name: string, avatar_seed: string): Member {
  return {
    user_id,
    email: null,
    full_name,
    avatar_seed,
    role: "member",
    can_comment: false,
    is_owner: false,
  };
}

/** Portraits picked in distinct background families, so they read apart at 24 px. */
export const FIGURE_MEMBERS = {
  camille: member("camille", "Camille Roy", "camille-aurora"),
  tom: member("tom", "Tom Martin", "tom"),
  alice: member("alice", "Alice Moreau", "alice"),
} as const;

/**
 * The categories every new project starts with. Their ids and colors are
 * fixed; their names come from `useFigureCategoryName`, in the reader's
 * language, as a project created in that language names them.
 */
export const FIGURE_CATEGORIES = Object.fromEntries(
  DEFAULT_CATEGORIES.map(({ key, color }) => [key, { id: key, name: key, color }]),
) as Record<DefaultCategoryKey, IssueCardCategory>;

/** A default category's name in the reader's language (`Categories.defaults`). */
export function useFigureCategoryName() {
  const t = useTranslations("Categories");
  return (key: DefaultCategoryKey) => t(`defaults.${key}`);
}

/** An issue as the card reads it; the title is already translated. */
export function figureIssue(
  fields: Pick<IssueCardIssue, "number" | "title" | "status" | "priority"> &
    Partial<IssueCardIssue>,
): IssueCardIssue {
  return {
    id: `figure-${fields.number}`,
    project_id: FIGURE_PROJECT_ID,
    description: null,
    effort: null,
    assignee_id: null,
    objective_id: null,
    due_date: null,
    recurrence: null,
    category_ids: [],
    ...fields,
  };
}

export function useFigureMaps() {
  const t = useTranslations("Categories");
  return useMemo(
    () => ({
      memberMap: new Map(Object.values(FIGURE_MEMBERS).map((m) => [m.user_id, m])),
      categoryMap: new Map(
        DEFAULT_CATEGORIES.map(({ key }) => [key, { ...FIGURE_CATEGORIES[key], name: t(`defaults.${key}`) }]),
      ),
    }),
    [t],
  );
}
