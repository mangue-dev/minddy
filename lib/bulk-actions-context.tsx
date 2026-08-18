"use client";

/**
 * Bulk-selection bridge between the boards' floating pill and the global command
 * palette (MIN-75). The kanban boards own the selection; the pill packages it
 * into a {@link BulkActionsRequest} and calls `requestBulkActions`, which the
 * <CommandPalette> reads to build a transient "N tickets selected" item and
 * open its actions popover — so bulk edits live in ⌘K (with the palette's inline
 * submenu forms) instead of a bespoke cmdk dropdown.
 *
 * The request is captured at click time (the palette is modal, so the selection
 * can't change underneath it); `openSignal` increments on every request so the
 * palette re-opens even when the same selection is acted on twice.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { IssueUpdateInput, Member, Objective } from "@/lib/types";
import { trackEvent } from "./analytics";

/** Bulk moves in and out of the key owner's current cycle (MIN-32). */
export interface BulkCycleActions {
  /** Selected tickets that can still join the cycle (live status, not already in). */
  addable: number;
  /** Selected tickets currently in the cycle. */
  removable: number;
  /** Adds every addable ticket — the ineligible ones are left alone. */
  onAdd: () => void;
  /** Removes every ticket of the selection that sits in the cycle. */
  onRemove: () => void;
}

export interface BulkActionsRequest {
  /** Number of selected tickets — drives the item title, plurals and confirms. */
  count: number;
  /** Where does the selection come from, for analytics only. By default “board” — the
 * triage (its left column) is named, otherwise everything would be counted together. */
  surface?: string;
  /** Assignable members across the selection's projects (already de-duplicated). */
  members: Member[];
  /** Applies a field patch to every selected ticket. */
  onUpdate: (patch: IssueUpdateInput) => void;
  /** Deletes the selection — absent when deletion isn't allowed (e.g. cycles). */
  onDelete?: () => void;
  /** Hands the selection to Numo (opens the agent composer). */
  onAskNumo: () => void;
  /** Cycle moves — absent when the user has no current cycle, or when nothing
   *  in the selection can move either way. */
  cycle?: BulkCycleActions;
  /** Objectives the whole selection can join. Empty/absent when the selection
   *  spans several projects (objectives are project-scoped) or the project has
   *  none — the "Changer l'objectif" row is then not offered. */
  objectives?: Objective[];
  /** Marks the selection as related to each other (MIN-25). Only wired when
   *  the selection is EXACTLY two tickets of the same project. */
  onLink?: () => void;
}

interface BulkActionsContextValue {
  /** The last requested selection (read by the palette). Null until first request. */
  request: BulkActionsRequest | null;
  /** Bumps on each request so the palette re-opens on repeat actions. */
  openSignal: number;
  /** Called by the pill's "Actions" button — stores the request and opens ⌘K. */
  requestBulkActions: (request: BulkActionsRequest) => void;
}

const BulkActionsContext = createContext<BulkActionsContextValue | null>(null);

export function BulkActionsProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<BulkActionsRequest | null>(null);
  const [openSignal, setOpenSignal] = useState(0);

  const requestBulkActions = useCallback((next: BulkActionsRequest) => {
    // MIN-75: the “Actions” button of the selection pill. It's the only one
    // waypoint to bulk actions — the size of the selection
    // says if the function is used for two tickets or thirty.
    trackEvent("bulk_selection_started", {
      surface: next.surface ?? "board",
      count: next.count,
    });
    setRequest(next);
    setOpenSignal((n) => n + 1);
  }, []);

  const value = useMemo<BulkActionsContextValue>(
    () => ({ request, openSignal, requestBulkActions }),
    [request, openSignal, requestBulkActions]
  );

  return (
    <BulkActionsContext.Provider value={value}>
      {children}
    </BulkActionsContext.Provider>
  );
}

export function useBulkActions(): BulkActionsContextValue {
  const ctx = useContext(BulkActionsContext);
  if (!ctx) {
    throw new Error("useBulkActions must be used within a BulkActionsProvider");
  }
  return ctx;
}
