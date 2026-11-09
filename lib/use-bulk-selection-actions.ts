"use client";

// ⇧P on a ticket SELECTION (MIN-539): ONE combined prompt for every checked
// ticket, copied to the clipboard for the user's own coding agent — never one
// prompt per ticket. The boards mount this hook once per surface; the same
// callback is handed to the selection pill, which exposes it as a
// command-palette bulk row.
//
// Keyboard arbitration follows “@” (lib/ask-numo-context.tsx): while a
// selection is up, the pill is the current mode and the selection outranks
// the hovered card. The per-card handlers (lib/keyboard/hover-keys.ts via
// components/issue-field-shortcuts.tsx) consult selectionKeysActive() at
// keystroke time and stand down WITHOUT consuming, so this file's single
// window listener owns ⇧P wherever the pointer rests; with no selection
// nothing changes.
//
// Like the “@” listener, the listener is mounted ONCE per surface and reads
// the selection, the translators and the callbacks through refs: it must
// never lag one render behind the state it acts on.

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { eventKey } from "@/lib/keyboard/event-key";
import { isTypingTarget, useChordPrefixForEvents } from "@/lib/keyboard/keyboard-context";
import {
  acquireSelectionKeys,
  selectionKeysActive,
} from "@/lib/keyboard/selection-keys";
import {
  multiIssuePromptFor,
  type IssuePromptInput,
  type MultiIssueAction,
} from "@/lib/issue-prompt";
import { usePromptAnnouncement, usePromptDelivery } from "@/lib/prompt-delivery-context";
import { sortedIdentifierList } from "@/lib/issue-constants";
import {
  loadIssuePromptContext,
  prefetchIssuePromptContext,
  UNAVAILABLE_FORGE_CONTEXT,
} from "@/lib/issue-prompt-context";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
} from "@/lib/prompt-copy-auto-start";
import { useAuth } from "@/lib/auth-context";
import type { Issue, IssueUpdateInput } from "@/lib/types";

export interface BulkSelectionActionsOptions {
  /** The surface's current selection — empty when it has none. */
  selectedIssues: Issue[];
  /** Per-issue prompt context (relations, categories) the surface resolves;
      called with the auto-start-adjusted issue when one applies (MIN-20). */
  buildInput: (issue: Issue) => IssuePromptInput;
  /** Field writes for the MIN-20 auto-start of a copied prompt. */
  onUpdateIssue?: (issue: Issue, patch: IssueUpdateInput) => void;
}

export function useBulkSelectionActions({
  selectedIssues,
  buildInput,
  onUpdateIssue,
}: BulkSelectionActionsOptions) {
  const tBulk = useTranslations("BulkActions");
  // The single-ticket “Copy identifier” says the same on a failed copy.
  const tPr = useTranslations("PullRequests");
  const { user } = useAuth();

  // Mirror refs — the listener subscribes once and always reads the current
  // values (same pattern as the “@” listener of lib/ask-numo-context.tsx).
  const selectionRef = useRef(selectedIssues);
  selectionRef.current = selectedIssues;
  const buildInputRef = useRef(buildInput);
  buildInputRef.current = buildInput;
  const onUpdateIssueRef = useRef(onUpdateIssue);
  onUpdateIssueRef.current = onUpdateIssue;
  const userRef = useRef(user);
  userRef.current = user;
  const tBulkRef = useRef(tBulk);
  tBulkRef.current = tBulk;
  const tPrRef = useRef(tPr);
  tPrRef.current = tPr;
  const promptDelivery = usePromptDelivery();
  const promptDeliveryRef = useRef(promptDelivery);
  promptDeliveryRef.current = promptDelivery;
  const announcePrompt = usePromptAnnouncement();
  const announcePromptRef = useRef(announcePrompt);
  announcePromptRef.current = announcePrompt;

  // A selection owns ⇧P for as long as it exists: the gate the per-card
  // handlers stand down on. Acquire/release on the boolean only, so editing
  // the selection (2 → 3 tickets) never leaks a count.
  const hasSelection = selectedIssues.length > 0;
  useEffect(() => {
    if (!hasSelection) return;
    return acquireSelectionKeys();
  }, [hasSelection]);

  // A selection is about to be copied (⇧P, bulk actions): warm its forge
  // context so the copy never waits on it (MIN-723).
  const selectedIdsKey = selectedIssues.map((issue) => issue.id).join(",");
  useEffect(() => {
    if (selectedIdsKey) prefetchIssuePromptContext(selectedIdsKey.split(","));
  }, [selectedIdsKey]);

  /**
   * One combined prompt for the whole selection, copied to the clipboard.
   * Implementing (⇧P) repeats the single-ticket side effects per ticket: a
   * waiting automation chain is canceled (MIN-147), and — when the account
   * preference is on (MIN-20) — tickets still pre-work move to “In progress”,
   * the prompt describing the REAL state after the move. Planning, verifying
   * and a custom request start nothing, as for one ticket (MIN-833).
   */
  const copyPrompt = useCallback(async (action: MultiIssueAction = "implement", request?: string) => {
    const issues = selectionRef.current;
    if (issues.length === 0) return;
    const autoStart =
      action === "implement" && resolvePromptCopyAutoStart(userRef.current?.user_metadata);
    const moved = new Set<string>();
    for (const issue of issues) {
      if (autoStart && shouldAutoStartOnPromptCopy(issue.status)) {
        moved.add(issue.id);
      }
    }
    // Pull requests and repository per issue (MIN-719), warmed with the
    // selection and waited for only briefly (MIN-723); an issue it could not
    // load in time says so in its block.
    // A short prompt only names the tickets, so it skips that read.
    const delivery = promptDeliveryRef.current;
    const forge = delivery.short
      ? null
      : await loadIssuePromptContext(issues.map((issue) => issue.id));
    const prompt = multiIssuePromptFor(
      issues.map((issue) => ({
        ...buildInputRef.current(
          moved.has(issue.id) ? { ...issue, status: "in_progress" } : issue,
        ),
        ...(forge ? (forge.get(issue.id) ?? UNAVAILABLE_FORGE_CONTEXT) : {}),
      })),
      action,
      { short: delivery.short, request },
    );
    const outcome = await delivery.deliver(prompt);
    const count = issues.length;
    for (const issue of issues) {
      if (moved.has(issue.id)) {
        onUpdateIssueRef.current?.(issue, { status: "in_progress" });
      }
    }
    const copied = moved.size > 0
      ? "promptCopiedMoved"
      : action === "plan"
        ? "planPromptCopied"
        : action === "verify" ? "verifyPromptCopied" : "promptCopied";
    announcePromptRef.current(outcome, tBulkRef.current(copied, { count }), moved.size);
  }, []);

  /** The selection's identifiers, comma-separated and smallest first (MIN-833). */
  const copyIdentifiers = useCallback(async () => {
    const issues = selectionRef.current;
    if (issues.length === 0) return;
    const list = sortedIdentifierList(
      issues.map((issue) => ({
        projectKey: buildInputRef.current(issue).projectKey,
        number: issue.number,
      })),
    );
    try {
      await navigator.clipboard.writeText(list);
      toast.success(list);
    } catch {
      toast.error(tPrRef.current("copyFailed"));
    }
  }, []);

  // THE listener: ⇧P acts on the selection when there is one. Everything
  // else — typing targets, an armed G-chord, modified combos — is left alone.
  const chordPrefixRef = useChordPrefixForEvents();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectionKeysActive()) return;
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (chordPrefixRef.current !== null) return;
      const key = eventKey(e);
      if (key !== "p") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void copyPrompt();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [copyPrompt]);

  return { copyPrompt, copyIdentifiers };
}
