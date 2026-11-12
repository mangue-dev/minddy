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
// the diff view of a commit.

import { focusFieldIn } from "@/lib/focus-field";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import {
  AttachButton,
  DropOverlay,
  pasteFileHandler,
  useFileDrop,
} from "@/components/resources";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import {
  DocumentEditor,
  type DocumentEditorApi,
} from "@/components/editor/document-editor";
import { forgeMentionScanner } from "@/lib/mention-scan";
import { NUMO_MENTION_ID } from "@/lib/mention-attributes";
import { SendShortcutKeys, SendShortcutTooltip } from "@/components/send-shortcut";
import { SendButtonWithCost } from "@/components/ui/send-button-with-cost";
import { usePrMembersQuery } from "@/lib/use-pr-members-query";
import { useForgeUploads } from "@/lib/use-forge-uploads";
import { useComposerFold } from "@/lib/use-composer-fold";
import type { PrEndpoint } from "@/lib/agent-api";
import { keepFieldFocusOnPress } from "@/lib/keep-field-focus";

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
  const tCommon = useTranslations("Common");
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
  const uploads = useForgeUploads(endpoint, onChange);
  const drop = useFileDrop(uploads.addFiles);

  const line = variant === "line";
  const body = value.trim();
  // A file still in flight would leave its queue IN the message
  // published: we wait until it has landed, as the ticket composer waits
  // its uploads.
  const canPost = !!body && !posting && !uploads.uploading;
  const gridRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  // A line remark stays a card: it is opened on purpose, with its Cancel.
  const expanded = useComposerFold({
    gridRef,
    textRef,
    controlRefs: [trailRef],
    value,
    forceExpanded: line,
  });

  return (
    <div ref={composerRef} className="flex min-w-0 max-w-full flex-col gap-2 font-sans">
      <div
        data-composer-layout={expanded ? "expanded" : "compact"}
        className={cn(
          "relative min-w-0 w-full max-w-full bg-control transition-colors",
          // The thread composer has the silhouette of Numo's (`chat-input`):
          // a pill on one line, a card once the text needs its own row
          // (lib/use-composer-fold). A LINE remark keeps a tighter radius: it
          // is anchored in the diff, at the size of a line of code, and
          // large corners would weigh more than the box itself.
          line ? "rounded-lg" : expanded ? "rounded-[1.625rem]" : "rounded-full",
          drop.dragging && "ring-2 ring-brand/20",
        )}
        onClick={focusFieldIn}
        // The first tap on Send, Dictate or Attach is the button's (MIN-959).
        onMouseDown={keepFieldFocusOnPress}
        onPaste={pasteFileHandler(uploads.addFiles)}
        {...drop.handlers}
      >
        <DropOverlay show={drop.dragging} />

        <div
          ref={gridRef}
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-end",
            expanded
              ? "[grid-template-areas:'text_text'_'._trail']"
              : "items-center [grid-template-areas:'text_trail']",
          )}
        >
          {/* WYSIWYG (MIN-548): the surface IS the preview — like the
              scratchpad, what is typed reads rendered, and there is no mode to
              switch. Markdown still flows in (quote, dictation, pasted upload
              links) and the forge accounts carry their own portrait in the
              pills. */}
          <div
            ref={textRef}
            className={cn(
              "min-w-0 self-stretch [grid-area:text]",
              !expanded && "flex flex-col justify-center-safe",
            )}
          >
            <ForgeMarkdownField
              endpoint={endpoint}
              value={value}
              onChange={onChange}
              onSubmit={() => {
                if (canPost) onSubmit();
              }}
              focusSignal={focusSignal}
              autoFocus={autoFocus}
              placeholder={placeholder}
              // Paddings live on the CONTENT, not on the editor envelope: the
              // placeholder is pinned at its top-left corner and must sit on the
              // first line, not on the box corner.
              className={cn("min-w-0 max-w-full", line ? "max-h-40 overflow-y-auto" : "max-h-48 overflow-y-auto")}
              contentClassName={cn(
                "[&_p]:my-0",
                line ? "px-3 py-2" : expanded ? "px-4 pt-3 pb-1" : "pt-[9px] pb-[7px] pl-4 pointer-coarse:py-2",
              )}
            />
          </div>

          <div
            ref={trailRef}
            className={cn(
              "flex items-center justify-end gap-1.5 [grid-area:trail]",
              // Same side paddings in both thread layouts: folding back weighs
              // the controls as they are now against the room the text wrapped in.
              line ? "px-2 pb-2" : cn("pl-1 pr-2.5", expanded ? "pb-2.5 pt-1" : "py-2.5"),
            )}
          >
            <AttachButton onFiles={uploads.addFiles} disabled={posting} />
            <DictateButton
              context="pull_request_comment"
              onTranscription={(text) =>
                onChange((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
              }
              disabled={posting}
            />
            {/* The thread only shows its submit button once there is
                something to send, round like Numo's; a line remark keeps a
                labelled one, because it was OPENED on purpose and has its
                Cancel next to it. */}
            {line ? (
              <>
                {onCancel ? (
                  <Button variant="ghost" size="sm" onClick={onCancel} disabled={posting}>
                    {tCommon("cancel")}
                  </Button>
                ) : null}
                <SendShortcutTooltip label={submitLabel}>
                  <Button size="sm" disabled={!canPost} onClick={onSubmit}>
                    {posting ? <Spinner /> : null}
                    {submitLabel}
                  </Button>
                </SendShortcutTooltip>
              </>
            ) : body || posting ? (
              <SendButtonWithCost
                cost={null}
                isLoading={posting}
                disabled={!canPost}
                onClick={onSubmit}
                ariaLabel={submitLabel}
                tooltipLabel={
                  <span className="inline-flex items-center gap-1.5">
                    {submitLabel}
                    <SendShortcutKeys />
                  </span>
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The WYSIWYG body of a forge message: the shared editor (MIN-728) with the
 * forge's mentions — the repository's collaborators, loaded at the first
 * "@", and `@Numo` — over a Markdown draft the caller owns. Quote, dictation
 * and uploads write into that draft; a value that did not come from the
 * editor is poured back in. Used by the thread and line composers and by the
 * review dialog, which brings its own submit button.
 */
export function ForgeMarkdownField({
  endpoint,
  value,
  onChange,
  onSubmit,
  onEscape,
  focusSignal,
  autoFocus,
  placeholder,
  className,
  contentClassName,
}: {
  endpoint: PrEndpoint;
  value: string;
  onChange: (transform: (draft: string) => string) => void;
  onSubmit?: () => void;
  onEscape?: () => void;
  /** Incremented when text was written into the draft from outside and the
   caret must follow it (“Quote”). */
  focusSignal?: number;
  autoFocus?: boolean;
  placeholder: string;
  className?: string;
  contentClassName?: string;
}) {
  // The forge accounts are only loaded at the first “@” typed: opening a PR
  // should not cost an extra query. Once requested, the list stays cached.
  const [wantsMentions, setWantsMentions] = useState(false);
  const { members } = usePrMembersQuery(endpoint, wantsMentions);
  // What the editor pushed last: the mirror compares to it to know when a
  // value came from OUTSIDE (quote, upload) and must be poured back in.
  const editorApiRef = useRef<DocumentEditorApi | null>(null);
  const lastEmittedRef = useRef(value);
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    editorApiRef.current?.setMarkdown(value);
  }, [value]);
  // A signal sent before the lazy editor is bound (⇧C switching to the
  // Activity tab, MIN-803) waits for the bind.
  const pendingFocusRef = useRef(false);
  useEffect(() => {
    if (!focusSignal) return;
    if (editorApiRef.current) editorApiRef.current.focus();
    else pendingFocusRef.current = true;
  }, [focusSignal]);
  const mentions = useMemo(() => ({
    // The LOGIN, never a displayed name: it is what the text carries and
    // what the forge resolves in notification. Numo leads the list — she is
    // the only mention minddy processes herself.
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
  }), [members]);

  return (
    <DocumentEditor
      value={value}
      onCommit={(markdown) => {
        lastEmittedRef.current = markdown;
        onChange(() => markdown);
      }}
      onChange={(markdown) => {
        lastEmittedRef.current = markdown;
        onChange(() => markdown);
      }}
      apiRef={(api) => {
        editorApiRef.current = api;
        if (pendingFocusRef.current) {
          pendingFocusRef.current = false;
          api.focus();
        }
      }}
      onSubmit={onSubmit}
      onEscape={onEscape}
      mentions={mentions}
      autoFocus={autoFocus}
      placeholder={placeholder}
      // A placeholder that wraps on a narrow screen grows the field instead
      // of being clipped (`placeholder-grows`, app/globals.css).
      className={cn("placeholder-grows", className)}
      contentClassName={contentClassName}
    />
  );
}
