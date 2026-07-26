import type { Project } from "./types";

/**
 * Which `project:{id}` realtime topics to join (MIN-89).
 *
 * The bridge used to subscribe to the single project parsed from the URL, which
 * left every cross-project surface — the dashboard, /all, /statistics, the
 * palette index, the project cards' counters — frozen until its staleTime
 * expired. It now joins all of my projects, bounded: one socket carries them
 * all, but each topic is a server-side subscription, so an account with a long
 * tail of projects shouldn't join every one of them to keep a counter warm.
 *
 * Pure and separate from the provider so it can be unit-tested (vitest runs on
 * plain node — no React, no next/navigation).
 */

/** Ceiling on simultaneously-joined project topics. */
export const MAX_PROJECT_CHANNELS = 25;

/**
 * My projects, most recently touched first (that's where writes actually
 * happen), capped at MAX_PROJECT_CHANNELS — plus the project currently on
 * screen, which is never dropped even when it falls outside the cap.
 * Soft-deleted projects are skipped: their topic would never emit.
 */
export function projectTopicIds(
  projects: Pick<Project, "id" | "updated_at" | "deleted_at">[] | undefined,
  activeProjectId: string | null
): string[] {
  const ids = (projects ?? [])
    .filter((p) => !p.deleted_at)
    .slice()
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .map((p) => p.id)
    .slice(0, MAX_PROJECT_CHANNELS);

  if (activeProjectId && !ids.includes(activeProjectId)) {
    // Evict the coldest project rather than exceed the cap: staleness on the
    // project being looked at is the one that would be noticed first.
    if (ids.length >= MAX_PROJECT_CHANNELS) ids.pop();
    ids.unshift(activeProjectId);
  }
  return ids;
}
