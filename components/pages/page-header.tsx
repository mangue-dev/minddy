"use client";

// The header of an open page: its icon and its TITLE (MIN-270).
//
// The title is a separate field, and especially NOT the first `H1` of the body. It is
// the decision that makes the sidebar, the search, the breadcrumbs, the
// subpage block and page link: all read a column, none have to
// open a ProseMirror document to find out what the page is called. The price
// is visible here, and nowhere else — two fields on the screen instead of one.
//
// The field is a self-expanding `textarea` (components/auto-textarea.tsx):
// a long title should wrap as it will in the document, and
// not scroll in a one-line slot.

import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { Smile } from "lucide-react";

import { AutoTextarea } from "@/components/auto-textarea";
import { EmojiPicker } from "@/components/pages/emoji-picker";

/**
 * Is the cursor on the LAST visible line of the field?
 *
 * A title does not have a line break (Enter goes down in the body), but it is
 * FOLDED: a long title is two or three lines on the screen, and ↓ must y
 * go down one line before leaving the field. Nothing in the DOM says about
 * which folded line falls on the caret, hence the measurement: a field which fits on
 * a line always returns `true`, and beyond that we only pass the hand at the end of the
 * text — that is to say at the end of the last line, the only position of which on
 * be sure.
 */
function caretOnLastLine(field: HTMLTextAreaElement): boolean {
  if (field.selectionStart !== field.selectionEnd) return false;
  if (field.selectionEnd === field.value.length) return true;
  const line = parseFloat(getComputedStyle(field).lineHeight);
  return !Number.isFinite(line) || field.scrollHeight < line * 1.5;
}

export function PageHeader({
  title,
  icon,
  onTitleChange,
  onIconChange,
  onEnter,
  onDown,
  fieldRef,
  autoFocus,
  readOnly,
  className,
}: {
  title: string;
  icon: string | null;
  onTitleChange: (title: string) => void;
  onIconChange: (icon: string | null) => void;
  /** Entry from the title: an empty line opens at the head of the body, cursor
 inside — the gesture of a line, not that of a field that is left. */
  onEnter?: () => void;
  /**
 * ↓ from the last line of the title: the cursor passes into the body, because
 * the first line of the body is indeed the line below. This is
 * the other half of the passage that title-bridge.ts holds in the editor.
 */
  onDown?: () => void;
  /** The field itself — where the caller returns focus (⌫ or ↑ in the
 body returns to the end of the title). */
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
  /**
 * Page that has just been created: the cursor is placed in the title (MIN-272).
 *
 * This is the only thing we have to do with a new page — it has neither name
 * nor content, and leaving the cursor nowhere would require clicking in a
 * empty field to start.
 */
  autoFocus?: boolean;
  readOnly?: boolean;
  /* WHO WROTE LAST is NO LONGER HERE (MIN-282): the line merged with
 the save state, at the top right of the surface — both
 answered the same question, "where is this document?" ”, from two
 opposite corners of the screen. See `PageStatus` (page-view.tsx). */
  className?: string;
}) {
  const t = useTranslations("Pages");

  // The field is NOT controlled by the prop while typing: saving
  // returns the server line, and reconnecting `value` to it would skip the
  // cursor at the end of the field on each round trip. We do not adopt a value
  // distant only when it differs from what we typed.
  const [draft, setDraft] = useState(title);
  const typed = useRef(title);
  useEffect(() => {
    if (title !== typed.current) {
      typed.current = title;
      setDraft(title);
    }
  }, [title]);

  return (
    // `group/header`: the “add an icon” button only exists when hovering over the
    // Title BLOCK, not its single line — we aim for the title to illustrate it, and
    // the target would evade if it only appeared above itself.
    <div className={cn("group/header flex flex-col gap-2", className)}>
      {icon ? (
        <div className="-ml-1">
          <EmojiPicker value={icon} onChange={onIconChange} />
        </div>
      ) : (
        // No icon: NOTHING by default, and especially not a 📄 that no one has
        // chosen. An icon automatically placed reads like a decision to
        // the user — all pages look the same, and whoever wants them
        // a real one doesn't see that he can change it.
        //
        // The place is RESERVED (`h-7`) even when the button is invisible:
        // without this, the title would jump 28 px on mouseover.
        <div className="-ml-1.5 flex h-7 items-center">
          <EmojiPicker value={null} onChange={onIconChange}>
            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground",
                "opacity-0 transition-opacity hover:bg-muted hover:text-foreground",
                // `data-state=open`: the selector open, the mouse goes towards
                // him and exits the header — its trigger should not
                // fade beneath it along the way.
                "group-hover/header:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              )}
            >
              <Smile className="size-3.5" />
              {t("addIcon")}
            </button>
          </EmojiPicker>
        </div>
      )}
      <AutoTextarea
        value={draft}
        ref={fieldRef}
        autoFocus={autoFocus}
        readOnly={readOnly}
        placeholder={t("titlePlaceholder")}
        aria-label={t("titleLabel")}
        spellCheck={false}
        onChange={(event) => {
          typed.current = event.target.value;
          setDraft(event.target.value);
          onTitleChange(event.target.value);
        }}
        onKeyDown={(event) => {
          // A title has no line break: Enter OPENS the next line,
          // which is the first of the body — the field behaves like the line
          // as it appears to be (cf. block-actions.ts, `focusDocumentStart`).
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter?.();
            return;
          }
          if (event.key === "ArrowDown" && onDown && caretOnLastLine(event.currentTarget)) {
            event.preventDefault();
            onDown();
          }
        }}
        className="w-full border-0 bg-transparent p-0 font-display text-4xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
