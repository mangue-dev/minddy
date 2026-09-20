"use client";

// ⇧P / ⇧A on a ticket SELECTION (MIN-539): ONE combined prompt for every
// checked ticket — copied to the clipboard (⇧P, the external-agent path) or
// handed to Numo (⇧A, action "implement") — never one prompt per ticket. The
// boards mount this hook once per surface; the same two callbacks are handed
// to the selection pill, which exposes them as command-palette bulk rows.
//
// Keyboard arbitration follows “@” (lib/ask-numo-context.tsx): while a
// selection is up, the pill is the current mode and the selection outranks
// the hovered card. The per-card handlers (lib/keyboard/hover-keys.ts via
// components/issue-field-shortcuts.tsx) consult selectionKeysActive() at
// keystroke time and stand down WITHOUT consuming, so this file's single
// window listener owns ⇧P/⇧A wherever the pointer rests; with no selection
// nothing changes.
//
// Like the “@” listener, the listener is mounted ONCE per surface and reads
// the selection, the translators and the callbacks through refs: it must
// never lag one render behind the state it acts on.

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { eventKey } from "@/lib/keyboard/event-key";
import { isTypingTarget, useChordPrefixForEvents } from "@/lib/keyboard/keyboard-context";
import {
  acquireSelectionKeys,
  selectionKeysActive,
} from "@/lib/keyboard/selection-keys";
import {
  buildMultiIssuePrompt,
  type IssuePromptInput,
} from "@/lib/issue-prompt";
import { handOffIssueApi } from "@/lib/agent-api";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
} from "@/lib/prompt-copy-auto-start";
import { useAuth } from "@/lib/auth-context";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { issuesPageContext } from "@/lib/assistant-issue-context";
import type { Issue, IssueUpdateInput } from "@/lib/types";

export interface BulkSelectionActionsOptions {
  /** The surface's current selection — empty when it has none. */
  selectedIssues: Issue[];
  /** The project the selection belongs to; null when it spans projects —
      the Numo composer then asks for one, like the existing bulk “Ask Numo”. */
  projectId: string | null;
  /** Readable identifier of one issue (“MIN-42”). */
  identifierOf: (issue: Issue) => string;
  /** Per-issue prompt context (relations, categories) the surface resolves;
      called with the auto-start-adjusted issue when one applies (MIN-20). */
  buildInput: (issue: Issue) => IssuePromptInput;
  /** Field writes for the MIN-20 auto-start of a copied prompt. */
  onUpdateIssue?: (issue: Issue, patch: IssueUpdateInput) => void;
}

export function useBulkSelectionActions({
  selectedIssues,
  projectId,
  identifierOf,
  buildInput,
  onUpdateIssue,
}: BulkSelectionActionsOptions) {
  const tAgent = useTranslations("Agent");
  const tBulk = useTranslations("BulkActions");
  const { user } = useAuth();
  const { openIntent } = useAssistantPanelActions();

  // Mirror refs — the listener subscribes once and always reads the current
  // values (same pattern as the “@” listener of lib/ask-numo-context.tsx).
  const selectionRef = useRef(selectedIssues);
  selectionRef.current = selectedIssues;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const identifierOfRef = useRef(identifierOf);
  identifierOfRef.current = identifierOf;
  const buildInputRef = useRef(buildInput);
  buildInputRef.current = buildInput;
  const onUpdateIssueRef = useRef(onUpdateIssue);
  onUpdateIssueRef.current = onUpdateIssue;
  const userRef = useRef(user);
  userRef.current = user;
  const tAgentRef = useRef(tAgent);
  tAgentRef.current = tAgent;
  const tBulkRef = useRef(tBulk);
  tBulkRef.current = tBulk;

  // A selection owns ⇧P/⇧A for as long as it exists: the gate the per-card
  // handlers stand down on. Acquire/release on the boolean only, so editing
  // the selection (2 → 3 tickets) never leaks a count.
  const hasSelection = selectedIssues.length > 0;
  useEffect(() => {
    if (!hasSelection) return;
    return acquireSelectionKeys();
  }, [hasSelection]);

  /**
   * One combined prompt for the whole selection, copied to the clipboard.
   * The single-ticket side effects repeat per ticket: a waiting automation
   * chain is canceled (MIN-147), and — when the account preference is on
   * (MIN-20) — tickets still pre-work move to “In progress”, the prompt
   * describing the REAL state after the move.
   */
  const copyPrompt = useCallback(async () => {
    const issues = selectionRef.current;
    if (issues.length === 0) return;
    const autoStart = resolvePromptCopyAutoStart(userRef.current?.user_metadata);
    const moved = new Set<string>();
    for (const issue of issues) {
      handOffIssueApi(issue.id);
      if (autoStart && shouldAutoStartOnPromptCopy(issue.status)) {
        moved.add(issue.id);
      }
    }
    const prompt = buildMultiIssuePrompt(
      issues.map((issue) =>
        buildInputRef.current(
          moved.has(issue.id) ? { ...issue, status: "in_progress" } : issue,
        ),
      ),
    );
    await navigator.clipboard.writeText(prompt);
    if (moved.size > 0) {
      for (const issue of issues) {
        if (moved.has(issue.id)) {
          onUpdateIssueRef.current?.(issue, { status: "in_progress" });
        }
      }
      toast.success(
        tBulkRef.current("promptCopiedMoved", { count: issues.length }),
      );
    } else {
      toast.success(tBulkRef.current("promptCopied", { count: issues.length }));
    }
  }, []);

  /**
   * Hands the whole selection to Numo in ONE request: the composer opens
   * pre-filled with a combined instruction. `pageContext` carries every
   * selected issue so the server turn resolves “the selection” without the
   * prompt having to inline descriptions.
   */
  const launchAgent = useCallback(() => {
    const issues = selectionRef.current;
    if (issues.length === 0) return;
    const projectId = projectIdRef.current;
    const identifierOf = identifierOfRef.current;
    const tAgent = tAgentRef.current;
    openIntent({
      source: "bulk",
      action: "implement",
      projectId,
      prompt: `${tAgent("launchPrompt.bulkHead", {
        count: issues.length,
        identifiers: issues.map(identifierOf).join(", "),
      })}\n\n${tAgent("launchPrompt.bulkBody")}`,
      pageContext: {
        ...(projectId ? { projectId } : {}),
        ...issuesPageContext(issues, identifierOf),
      },
    });
  }, [openIntent]);

  // THE listener: ⇧P/⇧A act on the selection when there is one. Everything
  // else — typing targets, an armed G-chord, modified combos — is left alone.
  const chordPrefixRef = useChordPrefixForEvents();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectionKeysActive()) return;
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (chordPrefixRef.current !== null) return;
      const key = eventKey(e);
      if (key !== "p" && key !== "a") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (key === "p") void copyPrompt();
      else launchAgent();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [copyPrompt, launchAgent]);

  return { copyPrompt, launchAgent };
}
