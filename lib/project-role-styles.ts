import type { ProjectRole } from "@/lib/project-roles";

/**
 * The color of each project role wherever a role badge appears: the project
 * and member hover cards (components/mention-preview-cards.tsx) and the
 * members settings (components/project-members.tsx).
 */
export const PROJECT_ROLE_BADGE_CLASS: Record<ProjectRole, string> = {
  owner: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  member: "bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  reader: "bg-slate-500/10 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300",
};

/** The same colors on a role picker, which keeps its tint when hovered or open. */
export const PROJECT_ROLE_PICKER_CLASS: Record<Exclude<ProjectRole, "owner">, string> = {
  member: `${PROJECT_ROLE_BADGE_CLASS.member} hover:bg-blue-500/15 aria-expanded:bg-blue-500/15 dark:hover:bg-blue-400/20 dark:aria-expanded:bg-blue-400/20`,
  reader: `${PROJECT_ROLE_BADGE_CLASS.reader} hover:bg-slate-500/15 aria-expanded:bg-slate-500/15 dark:hover:bg-slate-400/20 dark:aria-expanded:bg-slate-400/20`,
};
