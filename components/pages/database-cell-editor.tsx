"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  isDatabaseNumberDraft,
  parseDatabaseNumber,
  type DatabaseValue,
} from "@/lib/page-databases";

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
  const busy = useRef(false);
  const closing = useRef(false);
  const expected = useRef(value);
  const focusInput = useCallback((node: HTMLTextAreaElement | null) => {
    input.current = node;
    if (node) {
      node.focus({ preventScroll: true });
      node.select();
    }
  }, []);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [geometry, setGeometry] = useState({
    left: 0,
    top: 0,
    width: 240,
    height: 34,
  });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
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
      const editorWidth = Math.min(
        Math.max(anchor.width + 24, 240),
        width - 16,
      );
      field.style.width = `${editorWidth}px`;
      field.style.height = "0px";
      const editorHeight = Math.min(
        Math.max(34, field.scrollHeight + 2),
        Math.min(480, Math.max(34, height - 16)),
      );
      field.style.height = `${editorHeight}px`;
      setGeometry({
        left: Math.max(
          x + 8,
          Math.min(
            Math.max(anchor.left - 1, surface?.left ?? x + 8),
            x + width - editorWidth - 8,
          ),
        ),
        top: Math.max(
          y + 8,
          Math.min(anchor.top - 1, y + height - editorHeight - 8),
        ),
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
  const commit = async (restoreFocus = false) => {
    if (busy.current || closing.current) return;
    const next = numeric ? parseDatabaseNumber(draft) : draft || null;
    if (next === undefined) {
      setError(true);
      input.current?.setCustomValidity(t("numberRequired"));
      input.current?.reportValidity();
      input.current?.focus();
      return;
    }
    busy.current = true;
    setSaving(true);
    const ok =
      next === expected.current || (await save(next, expected.current));
    busy.current = false;
    setSaving(false);
    if (ok) {
      closing.current = true;
      setOpen(false);
      if (restoreFocus) trigger.current?.focus();
    } else input.current?.focus();
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
            ref={focusInput}
            aria-label={label}
            aria-invalid={error}
            data-database-cell-editor
            inputMode={numeric ? "decimal" : "text"}
            className="fixed z-[100] resize-none rounded-sm border border-ring bg-background px-2 py-1 text-sm leading-6 shadow-lg outline-none"
            style={geometry}
            maxLength={numeric ? 320 : 2000}
            value={draft}
            readOnly={saving}
            onChange={(event) => {
              if (!numeric || isDatabaseNumberDraft(event.target.value)) {
                setDraft(event.target.value);
                setError(false);
                event.target.setCustomValidity("");
              }
            }}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape") {
                event.preventDefault();
                if (!busy.current) {
                  closing.current = true;
                  setOpen(false);
                  trigger.current?.focus();
                }
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
