"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { AutoTextarea } from "@/components/auto-textarea";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";
import { SendShortcutTooltip, isSendShortcut } from "@/components/send-shortcut";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { useTitleBodyLink } from "@/lib/use-title-body-link";
import { FEEDBACK_TITLE_MAX } from "@/lib/feedback/types";

/** What the description field receives, plain or rich. */
export interface FeedbackBodyProps {
  bodyKey: number;
  initialBody: string;
  onBodyChange: (markdown: string) => void;
  placeholder: string;
  ariaLabel?: string;
  /** ArrowUp at the very start returns to the title (MIN-756). */
  onLeaveTop: () => void;
  /** The server's limit: the plain field stops there; the rich editor's
      caller checks it on submit. */
  maxLength?: number;
}

/** The description without the rich editor: same place, same type size.
    `bodyKey` remounts it on a new `initialBody`, as it does the editor. */
function PlainBody(props: FeedbackBodyProps) {
  return <PlainBodyField key={props.bodyKey} {...props} />;
}

function PlainBodyField({ initialBody, onBodyChange, placeholder, ariaLabel, onLeaveTop, maxLength }: FeedbackBodyProps) {
  const [value, setValue] = useState(initialBody);
  return (
    <AutoTextarea
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onBodyChange(event.target.value);
      }}
      onKeyDown={(event) => {
        const field = event.currentTarget;
        if (event.key === "ArrowUp" && field.selectionStart === 0 && field.selectionEnd === 0) {
          event.preventDefault();
          onLeaveTop();
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={maxLength}
      className="mt-3 min-h-24 w-full bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
    />
  );
}

/**
 * The feedback composer: a borderless title, a rich description under it,
 * then the voice on the left and the creation on the right. The Feedback
 * page's creation dialog and the “Share feedback” dialog of the help menu
 * both render it, so the two stay identical; the former slots its extra
 * properties (author, objective, visibility) between the description and
 * the action bar through `children`.
 *
 * The description is the plain field unless the caller passes `Body`, the
 * rich editor of the signed-in app (feedback-rich-body.tsx): the public
 * documentation reuses this dialog without the editor and its messages.
 *
 * The description is uncontrolled, like every rich editor: the caller keeps
 * the last Markdown in a ref (`onBodyChange`) and remounts the editor through
 * `bodyKey` to load another value (`initialBody`), after a dictation or a reset.
 */
export function FeedbackComposerDialog({
  open,
  onOpenChange,
  onRequestClose,
  srTitle,
  srDescription,
  title,
  onTitleChange,
  titlePlaceholder,
  titleAriaLabel,
  bodyKey,
  initialBody,
  onBodyChange,
  bodyPlaceholder,
  bodyAriaLabel,
  Body = PlainBody,
  bodyMaxLength,
  children,
  dictation,
  numoBusy = false,
  numoWorkingLabel,
  submitLabel,
  canSubmit,
  busy,
  onSubmit,
}: {
  open: boolean;
  /** Called with `true` only: closing always goes through `onRequestClose`. */
  onOpenChange: (open: boolean) => void;
  /** The cross, Escape, an outside click or Cancel: the caller may refuse. */
  onRequestClose: () => void;
  srTitle: string;
  srDescription?: string;
  title: string;
  onTitleChange: (title: string) => void;
  titlePlaceholder: string;
  titleAriaLabel?: string;
  bodyKey: number;
  initialBody: string;
  /** The description's Markdown, committed on blur. */
  onBodyChange: (markdown: string) => void;
  bodyPlaceholder: string;
  bodyAriaLabel?: string;
  /** The description field; the plain one by default. */
  Body?: ComponentType<FeedbackBodyProps>;
  bodyMaxLength?: number;
  /** Extra properties between the description and the action bar. */
  children?: ReactNode;
  dictation: {
    onTranscription: (text: string) => void;
    uploadAudio?: (blob: Blob) => Promise<string | null>;
    feature?: "feedback_voice";
    onProcessingChange: (processing: boolean) => void;
  };
  /** Numo is tidying a dictation into the fields: its face replaces the
      microphone and the modal's edge lights up. */
  numoBusy?: boolean;
  numoWorkingLabel?: string;
  submitLabel: string;
  canSubmit: boolean;
  busy: boolean;
  onSubmit: () => void;
}) {
  const tCommon = useTranslations("Common");
  // Title and description read as one text on the keyboard (MIN-756).
  const titleBody = useTitleBodyLink();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onRequestClose();
        else onOpenChange(true);
      }}
    >
      {/* ⌘/Ctrl+Enter sends from ANY field in the modal — the title
          like the body. The shortcut is placed here rather than on each field
          because the body is a rich editor: the key goes back to it through
          bubbling. `defaultPrevented` leaves priority to the editor
          when it uses the key itself (exiting a code block). */}
      <DialogContent
        className="top-24 translate-y-0 gap-0 sm:max-w-xl"
        // Without a description, say so explicitly (Radix warns otherwise).
        {...(srDescription ? {} : { "aria-describedby": undefined })}
        onKeyDown={(e) => {
          if (e.defaultPrevented || !isSendShortcut(e)) return;
          e.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <DialogTitle className="sr-only">{srTitle}</DialogTitle>
        {srDescription ? (
          <DialogDescription className="sr-only">{srDescription}</DialogDescription>
        ) : null}
        <AutoTextarea
          ref={titleBody.titleRef}
          autoFocus={allowInputAutoFocus()}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => {
            titleBody.onTitleKeyDown(e, {
              submit: () => {
                if (canSubmit) onSubmit();
              },
            });
          }}
          placeholder={titlePlaceholder}
          aria-label={titleAriaLabel}
          maxLength={FEEDBACK_TITLE_MAX}
          className="w-full title-field bg-transparent text-xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
        />
        <div ref={titleBody.bodyRef}>
          <Body
            bodyKey={bodyKey}
            initialBody={initialBody}
            onBodyChange={onBodyChange}
            placeholder={bodyPlaceholder}
            ariaLabel={bodyAriaLabel}
            onLeaveTop={titleBody.leaveBody}
            maxLength={bodyMaxLength}
          />
        </div>

        {children}

        {/* The voice on the left, the creation on the right — the same bar as on
            the public board and in the ticket modal. While Numo tidies up, its
            face takes the place of the microphone. */}
        <div className="mt-3 flex items-center justify-between gap-4 border-t pt-3">
          {numoBusy ? (
            <span
              className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center"
              aria-hidden
            >
              <NumoIcon
                state="thinking"
                className="size-6 text-primary animate-in fade-in duration-300"
              />
            </span>
          ) : (
            <DictateButton
              context="feedback_form"
              feature={dictation.feature}
              onTranscription={dictation.onTranscription}
              uploadAudio={dictation.uploadAudio}
              onProcessingChange={dictation.onProcessingChange}
              disabled={busy}
              shortcutKey="mod+shift+d"
              className="-ml-2"
            />
          )}
          {numoBusy && numoWorkingLabel ? (
            <span className="sr-only" role="status">
              {numoWorkingLabel}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" disabled={busy || numoBusy} onClick={onRequestClose}>
              {tCommon("cancel")}
            </Button>
            <SendShortcutTooltip scope="form" label={submitLabel}>
              <Button disabled={!canSubmit} onClick={onSubmit}>
                {busy && <Spinner />}
                {submitLabel}
              </Button>
            </SendShortcutTooltip>
          </div>
        </div>

        {/* Numo takes over the dictation: the border highlights the edge of the
            modal while it works — the same signal as its face, lower down. */}
        <AgentBeamOverlay active={numoBusy} />
      </DialogContent>
    </Dialog>
  );
}
