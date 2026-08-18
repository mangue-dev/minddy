"use client";

/**
 * The project in which the user launched the agent last time, retained
 * by browser.
 *
 * It pre-populates the composer with a conversation WITHOUT ticket, where the project is
 * the only mandatory choice (it is its repository that the agent clones): "where I
 * make the agent work" is better than "the one who sorts first".
 *
 * Memory SEPARATE from that of the creation dialog ([[last-create-project]]):
 * the fallback rule is the same, the gesture is not — you don't necessarily deposit your
 * tickets there where we launch the agent, and writing one to the other would move the
 * default of a dialog that didn't request anything.
 *
 * Local to the device like drafts and board views — a
 * preference, not a piece of data, so no server round trip. An absent or stale
 * value simply falls back to the fallback, and the caller still validates
 * the id against the current projects (the project may have been deleted, or
 * access lost).
 */

const KEY = "minddy:last-agent-project";

/** Retains a successful launch. */
export function rememberAgentProject(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, projectId);
  } catch {
    /* localStorage unavailable (private browsing / disabled) — ignore. */
  }
}

/** The selected project, or `null` if there is none. */
export function lastAgentProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * On which project the composer opens: the last where an agent was launched,
 * as long as it is still in the user's list, otherwise the first — and
 * this one is not arbitrary, the list arrives sorted by `updated_at`, therefore
 * this is the affected project most recently. Pure (the caller passes the retained id
 * via {@link lastAgentProjectId}), so testable.
 */
export function defaultAgentProjectId(
  projects: readonly { id: string }[],
  lastId: string | null
): string | null {
  if (lastId && projects.some((p) => p.id === lastId)) return lastId;
  return projects[0]?.id ?? null;
}
