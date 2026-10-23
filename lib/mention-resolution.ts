"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { MentionLinkType } from "@/lib/mention-link";
import { isObjectiveStatus, type ObjectiveStatus } from "@/lib/objective-validation";

/**
 * What the signed-in reader may see of a typed mention (MIN-734), resolved by
 * the server (`POST /api/mentions/resolve`, lib/server/mention-access.ts):
 * the target's current label, or `null` when it is not theirs to see. A
 * mention's stored label is never shown in its place — it would reveal the
 * name of a page, objective or project to someone without access.
 *
 * Requests are batched across every mention on screen and cached in memory
 * only, for a minute, so a rename shows up without a reload.
 */

/** `status`: an objective's, for the glyph of its pill (MIN-785). */
type Entry = { label: string | null; status?: ObjectiveStatus; at: number };

const TTL_MS = 60_000;
const BATCH = 200;

const cache = new Map<string, Entry>();
const queued = new Set<string>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

const keyOf = (type: MentionLinkType, id: string) => `${type}:${id}`;

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

async function flush() {
  timer = null;
  const keys = [...queued];
  queued.clear();
  for (let start = 0; start < keys.length; start += BATCH) {
    const chunk = keys.slice(start, start + BATCH);
    for (const key of chunk) inFlight.add(key);
    try {
      const response = await fetch("/api/mentions/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refs: chunk.map((key) => {
            const [type, id] = key.split(":");
            return { type, id };
          }),
        }),
      });
      const now = Date.now();
      if (response.ok) {
        const { mentions } = (await response.json()) as {
          mentions: Array<{ type: string; id: string; label: string | null; status?: unknown }>;
        };
        for (const mention of mentions) {
          cache.set(`${mention.type}:${mention.id}`, {
            label: mention.label,
            ...(isObjectiveStatus(mention.status) ? { status: mention.status } : {}),
            at: now,
          });
        }
      } else {
        // Not resolved is not resolvable: stay neutral, retry after the TTL.
        for (const key of chunk) cache.set(key, { label: null, at: now });
      }
    } catch {
      for (const key of chunk) cache.set(key, { label: null, at: Date.now() - TTL_MS / 2 });
    } finally {
      for (const key of chunk) inFlight.delete(key);
      notify();
    }
  }
}

function request(key: string) {
  if (queued.has(key) || inFlight.has(key)) return;
  queued.add(key);
  timer ??= setTimeout(() => void flush(), 0);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The resolution of one mention: `undefined` while it loads. */
export function useResolvedMentionLabel(
  type: MentionLinkType | null,
  id: string | null
): string | null | undefined {
  // The server render resolves nothing (`0`): it has no session, and the
  // browser's first render must match it.
  const current = useSyncExternalStore(subscribe, () => version, () => -1);
  const key = type && id ? keyOf(type, id) : null;
  const entry = key && current !== -1 ? cache.get(key) : undefined;
  const stale = !entry || Date.now() - entry.at > TTL_MS;
  // The request is a side effect: it runs after the render, never during it.
  useEffect(() => {
    if (key && stale) request(key);
  }, [key, stale]);
  if (!key) return null;
  return entry ? entry.label : undefined;
}

/**
 * The objective status the server returned with a resolved mention, read
 * from the same cache as its label; `undefined` until it is known. It never
 * requests: the label hook beside it does.
 */
export function useResolvedMentionStatus(
  type: MentionLinkType | null,
  id: string | null
): ObjectiveStatus | undefined {
  const current = useSyncExternalStore(subscribe, () => version, () => -1);
  if (!type || !id || current === -1) return undefined;
  return cache.get(keyOf(type, id))?.status;
}

/**
 * Record what the reader already knows: a mention picked from the menu is a
 * target they can see, under the label the menu showed. Its pill appears at
 * once instead of waiting for the server.
 */
export function primeMentionLabel(
  type: MentionLinkType,
  id: string,
  label: string,
  status?: ObjectiveStatus
): void {
  cache.set(keyOf(type, id), { label, ...(status ? { status } : {}), at: Date.now() });
  notify();
}

/** What each typed pill on screen showed: what a copy of it may carry. */
const shown = new Map<string, string | null>();

/** Record the label a pill shows (`null`: the neutral one). */
export function rememberShownMention(type: MentionLinkType, id: string, label: string | null): void {
  shown.set(keyOf(type, id), label);
}

/** The label a pill showed for this target, `undefined` if none showed it. */
export function shownMentionLabel(type: MentionLinkType, id: string): string | null | undefined {
  return shown.get(keyOf(type, id));
}

/** For tests: forget everything resolved so far. */
export function resetMentionResolution(): void {
  cache.clear();
  shown.clear();
  queued.clear();
  inFlight.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  notify();
}
