/**
 * Keep ticket results after every command, navigation target, and other entity.
 * The command palette renders categories in declaration order, so this stable
 * partition also preserves the existing order within both sets of groups.
 */
export function moveIssueGroupsToEnd<T extends { key?: string }>(
  groups: readonly T[]
): T[] {
  return [
    ...groups.filter((group) => group.key !== "issues"),
    ...groups.filter((group) => group.key === "issues"),
  ];
}
