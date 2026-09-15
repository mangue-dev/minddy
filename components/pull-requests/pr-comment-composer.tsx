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

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn, Spinner } from "mangue-ui";
import {
  AttachButton,
  DropOverlay,
  pasteFileHandler,
  useFileDrop,
} from "@/components/resources";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { Markdown } from "@/components/markdown";
import { MentionTextarea } from "@/components/mention-textarea";
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
  const [wantsMentions, setWantsMentions] = useState(false);
  const { members } = usePrMembersQuery(endpoint, wantsMentions);
  const uploads = useForgeUploads(endpoint, onChange);
  const drop = useFileDrop(uploads.addFiles);

  const line = variant === "line";
  const body = value.trim();
  // A file still in flight would leave its queue IN the message
  // published: we wait until it has landed, as the ticket composer waits
  // its uploads.
  const canPost = !!body && !posting && !uploads.uploading;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2 font-sans">
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

        {/* No write/preview switch (MIN-548): the field stays, and the
            rendered markdown lives UNDER it, live — like the scratchpad,
            writing and seeing what will be sent are one gesture, not two
            modes. The preview uses the app's real renderer, so code blocks,
            images and lists look exactly as they will at the forge. */}
        <MentionTextarea
          value={value}
          onChange={(next) => onChange(() => next)}
          forgeMembers={members}
          onMentionQuery={() => setWantsMentions(true)}
          focusSignal={focusSignal}
          autoFocus={autoFocus}
          onSubmit={onSubmit}
          onEscape={onCancel}
          placeholder={placeholder}
          // Anchored in the diff, the field is HIGH in a scrollable area:
          // a list that opened upwards would fold out of view.
          dropUp={!line}
          includeNumo
          className={cn(
            "rounded-none border-0 bg-transparent focus-visible:border-0 focus-visible:ring-0",
            line ? "max-h-40 px-3 py-2" : "px-3.5 py-2.5",
          )}
        />
        {body ? (
          <div
            data-testid="pr-composer-preview"
            className={cn(
              "min-w-0 max-w-full border-t border-border/60 text-muted-foreground",
              line ? "px-3 py-2" : "px-3.5 py-2.5",
            )}
          >
            <Markdown
              allowRawHtml
              linkVariant="plain"
              className="max-w-full text-foreground [&_code]:bg-primary/10 [&_code]:text-primary"
            >
              {value}
            </Markdown>
          </div>
        ) : null}

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
