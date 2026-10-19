"use client";

// The COMMENT field (MIN-728): the composer, the reply, the edit and the
// triage message, on the shared engine like every other text surface. No
// live collaboration and no realtime here — a comment is one person's text
// until it is sent.
//
// What the caller sees has not changed from the field it replaces: a
// controlled `value` / `onChange` on TEXT, where a mention is written “@Name”.
// That text goes to the server; `extractMentions` reads it to decide whom to
// notify, the server reads “@Numo” in it to wake the assistant, and the
// published comment re-infers its pills from it (one rule, lib/mention-scan).
// It is Markdown, and comments have always been rendered as Markdown.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  LazyDocumentEditor,
  type DocumentEditorMentions,
} from "@/components/editor/document-editor-lazy";
import type { DocumentEditorApi } from "@/components/editor/document-editor";
import type { MentionOption } from "@/components/mention-suggest";
import { NUMO_MENTION_ID } from "@/lib/mention-attributes";
import { memberLabel, mentionScanner } from "@/lib/mention-scan";
import type { Member } from "@/lib/types";

/** userIds mentioned in `text` as "@Display Name" tokens (matched against members). */
export function extractMentions(text: string, members: Member[]): string[] {
  const ids = new Set<string>();
  for (const m of members) {
    if (text.includes(`@${memberLabel(m)}`)) ids.add(m.user_id);
  }
  return [...ids];
}

export interface CommentEditorProps {
  value: string;
  onChange: (text: string) => void;
  /** The people of the project, when the surface has no richer sources. */
  members?: Member[];
  /** Full entity mentions (people, tickets, objectives, pages). */
  mentions?: DocumentEditorMentions;
  /** Offer “@Numo” (the assistant): comment composers only. */
  includeNumo?: boolean;
  onSubmit?: () => void;
  /** Escape with no menu open. */
  onEscape?: () => void;
  /** Changing this value focuses the field, caret at the end: for a gesture
   that writes into the draft from outside (a quote). */
  focusSignal?: number;
  placeholder?: string;
  ariaLabel?: string;
  /** Visible height before the first line is typed, in text rows. */
  rows?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}

const ROW_HEIGHT = {
  1: "min-h-[1.5rem]",
  2: "min-h-[3rem]",
  3: "min-h-[4.5rem]",
  4: "min-h-[6rem]",
} as const;

export function CommentEditor({
  value,
  onChange,
  members = [],
  mentions,
  includeNumo = false,
  onSubmit,
  onEscape,
  focusSignal,
  placeholder,
  ariaLabel,
  rows = 1,
  autoFocus = false,
  disabled = false,
  className,
}: CommentEditorProps) {
  // The identity of `members` is not stable across callers (an unanswered
  // query returns a new `[]` on each render): memorize its CONTENT, or the
  // scanner would change constantly and the pills would rest under the caret.
  const membersKey = members
    .map((m) => `${m.user_id} ${memberLabel(m)} ${m.avatar_seed}`)
    .join("\u0000");
  const fallbackScan = useMemo(
    () => mentionScanner(members),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [membersKey]
  );

  const options = useMemo<MentionOption[]>(() => {
    const list: MentionOption[] = mentions?.options
      ? [...mentions.options]
      : members.map((m) => ({
          type: "member" as const,
          id: m.user_id,
          label: memberLabel(m),
          avatarSeed: m.avatar_seed ?? undefined,
        }));
    // Numo ONLY lives in the list of suggestions: the `members` of callers
    // never contain it, so extractMentions cannot return its id as a notified
    // user. The real trigger is the server reading the body, case-insensitive.
    if (includeNumo) list.push({ type: "numo", id: NUMO_MENTION_ID, label: "Numo" });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersKey, includeNumo, mentions?.options]);

  const editorMentions = useMemo<DocumentEditorMentions>(
    () => ({
      options,
      scan: mentions?.scan ?? fallbackScan,
      links: mentions?.links,
      onQuery: mentions?.onQuery,
    }),
    [options, mentions?.scan, mentions?.links, mentions?.onQuery, fallbackScan]
  );

  // A controlled value over an editor that owns its document: what the editor
  // last reported is remembered, and any OTHER value is an external write (the
  // draft cleared after sending, a quote, a dictation) applied to the editor.
  const apiRef = useRef<DocumentEditorApi | null>(null);
  const emittedRef = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const bindApi = useCallback((api: DocumentEditorApi) => {
    apiRef.current = api;
    if (valueRef.current !== emittedRef.current) {
      emittedRef.current = valueRef.current;
      api.setMarkdown(valueRef.current);
    }
  }, []);

  const handleChange = useCallback((markdown: string) => {
    // An empty document serializes as "", never as stray whitespace.
    const next = markdown.trim() === "" ? "" : markdown;
    emittedRef.current = next;
    onChangeRef.current(next);
  }, []);

  useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    apiRef.current?.setMarkdown(value);
  }, [value]);

  useEffect(() => {
    if (focusSignal === undefined) return;
    apiRef.current?.focus();
  }, [focusSignal]);

  return (
    <LazyDocumentEditor
      value={value}
      onChange={handleChange}
      apiRef={bindApi}
      mentions={editorMentions}
      onSubmit={onSubmit}
      onEscape={onEscape}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      autoFocus={autoFocus}
      readOnly={disabled}
      className={cn(
        "max-h-48 w-full min-w-0 overflow-y-auto rounded-lg border border-input bg-transparent px-3 py-2 outline-none",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
      contentClassName={ROW_HEIGHT[Math.min(Math.max(rows, 1), 4) as 1 | 2 | 3 | 4]}
    />
  );
}
