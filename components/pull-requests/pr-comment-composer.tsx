"use client";

// Compose the comment of a pull request (MIN-162) — that of the FIL, and
// that of a LINE remark.
//
// It remained the poorest part of the app — a bare textarea and a button — on one
// false premise: “a comment goes to GitHub, where mentions and pieces
// joined do not make sense. Both have one, and these are two gestures that we
// done all the time. What CHANGES compared to composing a ticket
// (`CommentComposer`, components/issue-timeline) is neither the toolbar nor
// drag and drop: this is the SOURCE of mentions and the DESTINATION of
// fichiers.
//
// · The mentions come from the FORGE — the collaborators of the depot, not the
// minddy members: a `@` ends up at GitHub, where to quote someone who isn't there
// account does not notify anyone. `@Numo` makes the only exception, and it is
// said visually (her face, at the top of the list): it's minddy who
// process, before sending.
// · Files go to minddy storage and are written INTO the body of the
// message — the forge has no idea what a minddy attachment is, and
// will only display what the text says (see `useForgeUploads`).
//
// The preview is markdown rendered by the `Markdown` of the app: this is what
// most missed the eye, and the component already existed.
//
// A `PrEndpoint` and not a PR id: the diff view only knows it, and it is
// which allows the row field to be THE SAME in the PR panel and in
// the diff view of an agent session (the `agent-runs/[runId]/pr/*` facades).

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn, Spinner } from "mangue-ui";
import {
  AttachButton,
  DropOverlay,
  pasteFileHandler,
  useFileDrop,
} from "@/components/resources";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import {
  MarkdownEditor,
  type MarkdownEditorApi,
} from "@/components/markdown-editor";
import { forgeMentionScanner } from "@/lib/mention-scan";
import { NUMO_MENTION_ID } from "@/lib/mention-attributes";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { usePrMembersQuery } from "@/lib/use-pr-members-query";
import { useForgeUploads } from "@/lib/use-forge-uploads";
import type { PrEndpoint } from "@/lib/agent-api";

export function PrCommentComposer({
  endpoint,
  value,
  onChange,
  onSubmit,
  onCancel,
  posting,
  placeholder,
  submitLabel,
  focusSignal,
  autoFocus,
  variant = "thread",
}: {
  endpoint: PrEndpoint;
  value: string;
  /** The draft lives with the caller: “Quote” also writes there (quoteReply). */
  onChange: (transform: (draft: string) => string) => void;
  onSubmit: () => void;
  /** Present on a line remark: it opens and closes, where the
 dial of the thread is still there. Escape calls him. */
  onCancel?: () => void;
  posting: boolean;
  placeholder: string;
  submitLabel: string;
  /** Incremented by “Quote”: the message has just been written in the draft,
 the cursor must follow. */
  focusSignal?: number;
  autoFocus?: boolean;
  /**
 * `thread`: pinned at the bottom of the panel — suggestions open TOWARDS
 * UP, otherwise they would go off the screen.
 * `line`: anchored under a line in the diff, in the middle of a scrolling area —
 * more compact, and it has a Cancel button.
 */
  variant?: "thread" | "line";
}) {
  const t = useTranslations("PullRequests");
  // The forge accounts are only loaded at the first “@” typed: open a
  // PR should not cost any extra query, and most of them can be read without having to
  // write there. The flag never comes down — once the list is requested, it
  // stays cached for the entire time of the panel.
  // An editor keeps its caret only while focused; some outside clicks
  // (user-select:none surfaces, certain panels) do not take the focus away.
  // One listener guarantees the rule: a press OUTSIDE the composer unwinds
  // the focus, whatever the surface (MIN-548).
  const composerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      const root = composerRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      const active = document.activeElement;
      // Only unwinds a contenteditable focus (ours): the press outside
      // never lands while the caret blinks again.
      if (active instanceof HTMLElement && active.isContentEditable) {
        active.blur();
      }
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);
  const [wantsMentions, setWantsMentions] = useState(false);
  const { members } = usePrMembersQuery(endpoint, wantsMentions);
  // The WYSIWYG surface owns the text; the draft stays with the CALLER
  // (quote, dictate and uploads write through it). What the editor pushed
  // last: the mirror compares to it to know when a value came from
  // OUTSIDE (quote) and must be poured back in.
  const editorApiRef = useRef<MarkdownEditorApi | null>(null);
  const lastEmittedRef = useRef(value);
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const api = editorApiRef.current;
    if (api) api.setMarkdown(value);
  }, [value]);
  // “Quote” wrote into the draft: the caret must land after it.
  useEffect(() => {
    if (!focusSignal) return;
    editorApiRef.current?.focus();
  }, [focusSignal]);
  const editorMentions = useMemo(() => {
    // The LOGIN, never a displayed name: it is what the text carries and
    // what the forge resolves in notification. Numo leads the list — she is
    // the only mention minddy processes herself.
    return {
      options: [
        { type: "numo" as const, id: NUMO_MENTION_ID, label: "Numo" },
        ...members.map((m) => ({
          type: "forge" as const,
          id: m.login,
          label: m.login,
          iconUrl: m.avatar_url,
        })),
      ],
      scan: forgeMentionScanner(members),
      onQuery: () => setWantsMentions(true),
    };
  }, [members]);
  const uploads = useForgeUploads(endpoint, onChange);
  const drop = useFileDrop(uploads.addFiles);

  const line = variant === "line";
  const body = value.trim();
  // A file still in flight would leave its queue IN the message
  // published: we wait until it has landed, as the ticket composer waits
  // its uploads.
  const canPost = !!body && !posting && !uploads.uploading;

  return (
    <div ref={composerRef} className="flex min-w-0 max-w-full flex-col gap-2 font-sans">
      <div
        className={cn(
          "relative min-w-0 w-full max-w-full border border-border transition-colors focus-within:border-ring",
          // The wire dial carries the radius of the Numo field on the page
          // Agents (`chat-input`, rounded-2xl): it's the same gesture, the same
          // space on the screen, there was no reason for it to have another
          // silhouette. That of a LINE remark keeps a radius more
          // tight — it is anchored in the diff, at the size of a line of code,
          // and 24px of corners would weigh more than the box itself.
          line ? "rounded-lg bg-background" : "rounded-2xl bg-card",
          drop.dragging && "border-brand",
        )}
        onPaste={pasteFileHandler(uploads.addFiles)}
        {...drop.handlers}
      >
        <DropOverlay show={drop.dragging} />

        {/* WYSIWYG (MIN-548): the surface IS the preview — like the
            scratchpad, what is typed reads rendered, and there is no mode to
            switch. Markdown still flows in (quote, dictation, pasted upload
            links) and the forge accounts carry their own portrait in the
            pills. */}
        <MarkdownEditor
          value={value}
          onCommit={(markdown) => {
            lastEmittedRef.current = markdown;
            onChange(() => markdown);
          }}
          apiRef={(api) => {
            editorApiRef.current = api;
          }}
          onChange={(markdown) => {
            lastEmittedRef.current = markdown;
            onChange(() => markdown);
          }}
          onSubmit={() => {
            if (canPost) onSubmit();
          }}
          mentions={editorMentions}
          autoFocus={autoFocus}
          placeholder={placeholder}
          // Paddings live on the CONTENT, not on the editor envelope: the
          // placeholder is pinned at its top-left corner and must sit on the
          // first line, not on the box corner.
          className={cn("min-w-0 max-w-full", line && "max-h-40 overflow-y-auto")}
          contentClassName={cn(
            "[&_p]:my-0",
            line ? "px-3 py-2" : "px-3.5 py-2.5",
          )}
        />

        <div
          className={cn(
            "flex items-center justify-end gap-1.5",
            line ? "px-2 pb-2" : "px-2.5 pb-2.5",
          )}
        >
          <AttachButton onFiles={uploads.addFiles} disabled={posting} />
          <DictateButton
            onTranscription={(text) =>
              onChange((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
            }
            disabled={posting}
          />
          {/* The thread only shows its submit button once there is something to send; a line remark keeps it, because it was OPENED on purpose and has its Cancel next to it. */}
          {line || body || posting ? (
            <>
              {onCancel ? (
                <Button variant="ghost" size="sm" onClick={onCancel} disabled={posting}>
                  {t("cancel")}
                </Button>
              ) : null}
              <SendShortcutTooltip label={submitLabel}>
                <Button
                  size="sm"
                  className={cn(!line && "rounded-full px-4")}
                  disabled={!canPost}
                  onClick={onSubmit}
                >
                  {posting ? <Spinner /> : null}
                  {submitLabel}
                </Button>
              </SendShortcutTooltip>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
