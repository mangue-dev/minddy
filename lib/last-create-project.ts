"use client";

/**
 * The project the user last created an issue in, remembered per browser.
 *
 * Feeds the default target of the app-wide create dialog when the route carries
 * no project (home, cross-project board, palette): "where I file tickets" beats
 * "whichever project happens to sort first", which is arbitrary.
 *
 * Device-local like the drafts and the board views — a preference, not data, so
 * no server round-trip. A missing or stale value simply falls back, and callers
 * validate the id against the user's current projects before using it (the
 * project may have been deleted, or access lost).
 */

const KEY = "minddy:last-create-project";

/** Remember a successful creation. */
export function rememberCreateProject(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, projectId);
  } catch {
    /* localStorage unavailable (private mode / disabled) — ignore. */
  }
}

/** The remembered project, or null when there is none. */
export function lastCreateProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Which project a create dialog opens on when the route names none: the last
 * one a ticket was created in, as long as it is still in the user's list, else
 * the first. Pure — the caller passes the remembered id from
 * {@link lastCreateProjectId} — so the choice is unit-testable.
 */
export function defaultCreateProjectId(
  projects: readonly { id: string }[],
  lastId: string | null
): string | null {
  if (lastId && projects.some((p) => p.id === lastId)) return lastId;
  return projects[0]?.id ?? null;
}
