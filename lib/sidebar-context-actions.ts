import type { ContextMenuAction } from "@/components/issue-context-menu";

/**
 * Order of a sidebar row's right-click menu (MIN-685): what the row's object
 * can do first, then the shared navigation entries (open in a new tab, copy
 * the link), then the destructive entries, always last and set apart.
 *
 * Navigation entries bring their own leading separator. A destructive group
 * gets one too, so "Move to trash" never sits flush against a safe action.
 */
export function composeSidebarContextActions(
  objectActions: readonly ContextMenuAction[],
  navigationActions: readonly ContextMenuAction[],
): ContextMenuAction[] {
  const safe = objectActions.filter((action) => action.variant !== "destructive");
  const destructive = objectActions
    .filter((action) => action.variant === "destructive")
    .map((action, index) => (index === 0 ? { ...action, separatorBefore: true } : action));
  return [...safe, ...navigationActions, ...destructive];
}
