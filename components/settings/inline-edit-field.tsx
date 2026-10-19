"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { FormDialog } from "@/components/form-dialog";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { cn } from "@/lib/utils";

/**
 * A value edited where it is shown (MIN-737): the profile name, a project's
 * name and key. Selecting it turns it into a field on desktop — Enter or
 * leaving the field saves, Escape cancels — and opens a bottom sheet in the
 * mobile layout, where an in-place field would sit under the software
 * keyboard. Without `onSave` the value is read-only and renders as text.
 */
export function InlineEditField({
  value,
  onSave,
  label,
  editLabel,
  placeholder,
  validate,
  normalize = (next) => next,
  maxLength,
  monospace = false,
  children,
  className,
  inputClassName,
}: {
  value: string;
  /** Persist the new value; a rejection keeps the field open with a toast. */
  onSave?: (next: string) => Promise<void>;
  /** Field name: the input's label and the sheet title. */
  label: string;
  /** Accessible name of the button that starts editing. */
  editLabel: string;
  placeholder?: string;
  /** Message to show for an invalid value, or null when it can be saved. */
  validate?: (next: string) => string | null;
  /** Applied on every keystroke (trimming, upper-casing a key…). */
  normalize?: (next: string) => string;
  maxLength?: number;
  /** Upper-case monospace field, for identifiers such as a project key. */
  monospace?: boolean;
  /** How the value reads when it is not being edited. */
  children: ReactNode;
  className?: string;
  inputClassName?: string;
}) {
  const tCommon = useTranslations("Common");
  const mobile = useMobileLayout() === true;
  const sheetInputId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  // Escape blurs the field too: the flag keeps that blur from saving.
  const cancelled = useRef(false);

  // Each edit starts from the saved value rather than an abandoned draft.
  useEffect(() => {
    setDraft(value);
  }, [value, editing]);

  if (!onSave) return <div className={className}>{children}</div>;

  const dirty = draft.trim() !== value;

  const save = async () => {
    if (busy) return;
    if (!dirty) {
      setEditing(false);
      return;
    }
    const next = draft.trim();
    const problem = validate?.(next) ?? null;
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      setEditing(false);
    }
  };

  return (
    <div className={className}>
      {editing && !mobile ? (
        <Input
          autoFocus
          aria-label={label}
          value={draft}
          disabled={busy}
          maxLength={maxLength}
          onChange={(e) => setDraft(normalize(e.target.value))}
          onKeyDown={onKeyDown}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            if (cancelled.current) {
              cancelled.current = false;
              return;
            }
            void save();
          }}
          placeholder={placeholder}
          className={cn(monospace && "font-mono uppercase", inputClassName)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={editLabel}
          className={cn(
            "group flex max-w-full items-center gap-2 rounded-md px-2 py-1 outline-none transition-colors",
            "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {children}
          <HugeiconsIcon
            icon={PencilEdit02Icon}
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </button>
      )}

      {/* Mobile layout only: the same field, in the bottom sheet. */}
      <FormDialog
        open={editing && mobile}
        onOpenChange={(open) => !busy && setEditing(open)}
        title={label}
        onSubmit={save}
        submitLabel={tCommon("save")}
        submitDisabled={!dirty}
        submitting={busy}
        cancelLabel={tCommon("cancel")}
      >
        <Field>
          <FieldLabel htmlFor={sheetInputId} className="sr-only">
            {label}
          </FieldLabel>
          <Input
            id={sheetInputId}
            value={draft}
            maxLength={maxLength}
            onChange={(e) => setDraft(normalize(e.target.value))}
            placeholder={placeholder}
            className={cn(monospace && "font-mono uppercase")}
          />
        </Field>
      </FormDialog>
    </div>
  );
}
