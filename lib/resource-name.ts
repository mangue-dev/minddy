// The display name of a resource (MIN-742): the `file_name` column of an
// attachment row. Storage keys are opaque ids, so renaming a file never moves
// its bytes; only this label changes.
//
// Shared by the rename dialog and the server so both refuse the same names.

/** Same bound as the registration routes (`parseResourcesInput`). */
export const MAX_RESOURCE_NAME_LENGTH = 200;

/**
 * A name as it will be stored: trimmed, on one line, at most 200 characters.
 * `null` when nothing remains, or when the value is not a string.
 */
export function normalizeResourceName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_RESOURCE_NAME_LENGTH).trim();
  return name || null;
}

/**
 * The part of a file name a rename usually changes: everything before the
 * extension. The dialog selects this range so typing keeps `.pdf`.
 */
export function resourceNameStemLength(name: string): number {
  const extension = /\.[^.\s]{1,8}$/.exec(name);
  return extension && extension.index > 0 ? extension.index : name.length;
}

/** Only files and links carry their own name; a page shows its live title. */
export function isRenamableResource(resource: { kind?: string | null }): boolean {
  return resource.kind !== "page";
}
