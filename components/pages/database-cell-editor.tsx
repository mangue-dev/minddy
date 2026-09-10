"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  isDatabaseNumberDraft,
  parseDatabaseNumber,
  type DatabaseValue,
} from "@/lib/page-databases";
import { useArrowField } from "@/lib/use-arrow-field";

/** A floating editor occupies the cell's visual position without resizing its row. */
export function DatabaseCellEditor({
  value,
  numeric,
  label,
  className,
  empty,
  save,
}: {
  value: DatabaseValue;
  numeric: boolean;
  label: string;
  className: string;
  empty: string;
  save: (value: DatabaseValue, expected: DatabaseValue) => Promise<boolean>;
}) {
  const t = useTranslations("PageDatabase");
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const closing = useRef(false);
  const expected = useRef(value);
  const focusInput = useCallback((node: HTMLTextAreaElement | null) => {
    input.current = node;
    if (node) {
      node.focus({ preventScroll: true });
      node.select();
    }
  }, []);
  // “->” becomes “→” while typing, in text cells only — a number draft is
  // never retouched by the rule. The hook borrows `focusInput` so its caret
  // restore aims at the same node this callback focuses.
  const arrow = useArrowField(focusInput);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);
  const [geometry, setGeometry] = useState({
    left: 0,
    top: 0,
    width: 240,
    height: 42,
  });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const panel = trigger.current?.closest<HTMLElement>("[role=dialog]");
      const panelBox = panel?.getBoundingClientRect();
      const surface = trigger.current
        ?.closest<HTMLElement>("[data-database-scroll]")
        ?.getBoundingClientRect();
      const field = input.current;
      if (!anchor || !field) return;
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const leftEdge = Math.max(x, panelBox?.left ?? x) + 8;
      const rightEdge = Math.min(x + width, panelBox?.right ?? x + width) - 8;
      const topEdge = Math.max(y, panelBox?.top ?? y) + 8;
      const bottomEdge =
        Math.min(y + height, panelBox?.bottom ?? y + height) - 8;
      const editorWidth = Math.min(
        Math.max(anchor.width + 24, 240),
        rightEdge - leftEdge,
      );
      field.style.width = `${editorWidth}px`;
      field.style.height = "0px";
      const editorHeight = Math.min(
        Math.max(42, field.scrollHeight + 2),
        Math.min(480, Math.max(42, bottomEdge - topEdge)),
      );
      field.style.height = `${editorHeight}px`;
      setGeometry({
        // Dialogs position the portal locally, including drawers with will-change: transform.
        left:
          Math.max(
            leftEdge,
            Math.min(
              Math.max(anchor.left - 1, surface?.left ?? leftEdge),
              rightEdge - editorWidth,
            ),
          ) -
          (panelBox?.left ?? 0) +
          (panel?.scrollLeft ?? 0) -
          (panel?.clientLeft ?? 0),
        top:
          Math.max(
            topEdge,
            Math.min(anchor.top - 1, bottomEdge - editorHeight),
          ) -
          (panelBox?.top ?? 0) +
          (panel?.scrollTop ?? 0) -
          (panel?.clientTop ?? 0),
        width: editorWidth,
        height: editorHeight,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open, draft]);
  const commit = (restoreFocus = false) => {
    if (closing.current) return;
    const next = numeric ? parseDatabaseNumber(draft) : draft || null;
    if (next === undefined) {
      setError(true);
      input.current?.setCustomValidity(t("numberRequired"));
      input.current?.reportValidity();
      input.current?.focus();
      return;
    }
    closing.current = true;
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
    if (next !== expected.current) void save(next, expected.current);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        className={className}
        onClick={() => {
          closing.current = false;
          expected.current = value;
          setDraft(value == null ? "" : String(value));
          setError(false);
          setOpen(true);
        }}
      >
        {value == null || value === "" ? (
          <span className="text-muted-foreground">{empty}</span>
        ) : (
          String(value).slice(0, 160)
        )}
      </button>
      {open &&
        createPortal(
          <textarea
            ref={arrow.ref}
            aria-label={label}
            aria-invalid={error}
            data-database-cell-editor
            inputMode={numeric ? "decimal" : "text"}
            className="fixed z-[100] resize-none rounded-sm border border-ring bg-background px-2 py-2 text-sm leading-6 shadow-lg outline-none"
            style={{
              ...geometry,
              position: trigger.current?.closest("[role=dialog]")
                ? "absolute"
                : "fixed",
            }}
            maxLength={numeric ? 320 : 2000}
            value={draft}
            onChange={(event) => {
              // The arrow rule must not rewrite a number draft.
              const next = numeric ? event.target.value : arrow.read(event);
              if (!numeric || isDatabaseNumberDraft(next)) {
                setDraft(next);
                setError(false);
                event.target.setCustomValidity("");
              }
            }}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closing.current = true;
                setOpen(false);
                trigger.current?.focus();
              } else if (
                event.key === "Enter" &&
                (!event.shiftKey || numeric)
              ) {
                event.preventDefault();
                void commit(true);
              }
            }}
          />,
          trigger.current?.closest<HTMLElement>("[role=dialog]") ??
            document.body,
        )}
    </>
  );
}
