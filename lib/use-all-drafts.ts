"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "./auth-context";
import { useProjects } from "./projects-context";
import { capabilitiesForProject } from "./use-project-capabilities";
import {
  deleteDraft,
  draftStorageKey,
  readDrafts,
  subscribeDrafts,
  type DraftKind,
  type IssueDraft,
  type ObjectiveDraft,
} from "@/lib/drafts";

/** One issue or objective draft, as the drafts tray lists it (MIN-753). */
export interface DraftEntry {
  kind: DraftKind;
  id: string;
  projectId: string;
  /** Issue title or objective name; may be empty. */
  title: string;
  /** Markdown description; may be empty. */
  description: string;
  updatedAt: number;
}

interface Snapshot {
  issue: IssueDraft[];
  objective: ObjectiveDraft[];
}

const EMPTY: Snapshot = { issue: [], objective: [] };
const KINDS: DraftKind[] = ["issue", "objective"];

// One store for the whole app: the bottom-bar tray and the command palette
// read the same lists, so the sealed drafts are restored once per account
// rather than once per consumer.
let snapshot: Snapshot = EMPTY;
let loadedFor: string | null | undefined;
const subscribers = new Set<() => void>();
let detach: (() => void) | null = null;

function publish(next: Snapshot) {
  snapshot = next;
  for (const notify of subscribers) notify();
}

// A legacy (unsealed) store or a failed restore shows no drafts here: the
// creation dialogs keep reporting restore errors when they open.
const readQuietly = <K extends DraftKind>(kind: K) => readDrafts(kind).catch(() => []);

async function reload(kind: DraftKind, owner: string | null) {
  const drafts = await readQuietly(kind);
  if (loadedFor === owner) publish({ ...snapshot, [kind]: drafts });
}

function load(owner: string | null) {
  loadedFor = owner;
  publish(EMPTY);
  if (!owner) return;
  for (const kind of KINDS) void reload(kind, owner);
}

function attach() {
  // This tab's writes arrive with their list; another tab's only as a
  // storage change, which is read again.
  const unsubscribe = subscribeDrafts((kind, drafts) => publish({ ...snapshot, [kind]: drafts }));
  const onStorage = (event: StorageEvent) => {
    const kind = KINDS.find((candidate) => draftStorageKey(candidate) === event.key);
    if (kind && loadedFor) void reload(kind, loadedFor);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    unsubscribe();
    window.removeEventListener("storage", onStorage);
  };
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  detach ??= attach();
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) {
      detach?.();
      detach = null;
      // Read again on the next mount: writes made meanwhile were not followed.
      loadedFor = undefined;
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

/**
 * Every issue and objective draft of the signed-in account that can still be
 * finished: drafts of a project the viewer can no longer write (left, or now
 * a reader) are kept in the store but not offered. Most recent first.
 */
export function useAllDrafts() {
  const t = useTranslations("Drafts");
  const { user } = useAuth();
  const { projects } = useProjects();
  const owner = user?.id ?? null;
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (loadedFor !== owner) load(owner);
  }, [owner]);

  const drafts = useMemo(() => {
    const writable = new Set(
      projects.filter((project) => capabilitiesForProject(project, owner).canWrite).map((project) => project.id),
    );
    const entries: DraftEntry[] = [
      ...current.issue.map((draft) => ({
        kind: "issue" as const, id: draft.id, projectId: draft.projectId,
        title: draft.title, description: draft.description, updatedAt: draft.updatedAt,
      })),
      ...current.objective.map((draft) => ({
        kind: "objective" as const, id: draft.id, projectId: draft.projectId,
        title: draft.name, description: draft.description, updatedAt: draft.updatedAt,
      })),
    ];
    return entries
      .filter((entry) => writable.has(entry.projectId))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [current, projects, owner]);

  const remove = useCallback(
    async (kind: DraftKind, id: string) => {
      try { await deleteDraft(kind, id); return true; }
      catch { toast.error(t("deleteFailed")); return false; }
    },
    [t],
  );

  return { drafts, remove };
}
