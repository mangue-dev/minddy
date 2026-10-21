"use client";

// Single-key shortcuts for an objective's fields (MIN-757), in the
// new-objective dialog and on the objective page. They are the issue keys
// wherever an objective has the same field — S status, A lead (the assignee
// key), D target date (the due-date key), R relation — plus C for the color,
// which issues do not have. C is the app-wide "new issue" key elsewhere: the
// listener claims it before that quick-create runs (capture phase, propagation
// stopped), so it only changes meaning where an objective's fields are shown.

import { useEffect, useRef, type RefObject } from "react";
import {
  KEY_FOR_FIELD,
  RELATION_SHORTCUT_KEY,
} from "@/components/issue-field-shortcuts";
import { eventKey } from "@/lib/keyboard/event-key";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";
import { hasVisibleOpenDialog } from "@/lib/visible-overlays";

/** Objective pickers a keyboard shortcut can open. */
export type ObjectiveShortcutField =
  | "status"
  | "lead"
  | "targetDate"
  | "color"
  | "relation";

/** Field → uppercase key badge shown in the pickers' tooltips. Derived from the
 *  issue mapping so both entities can never drift apart. */
export const OBJECTIVE_KEY_FOR_FIELD: Record<ObjectiveShortcutField, string> = {
  status: KEY_FOR_FIELD.status,
  lead: KEY_FOR_FIELD.assignee,
  targetDate: KEY_FOR_FIELD.dueDate,
  color: "C",
  relation: RELATION_SHORTCUT_KEY.toUpperCase(),
};

const FIELD_FOR_KEY = Object.fromEntries(
  Object.entries(OBJECTIVE_KEY_FOR_FIELD).map(([field, key]) => [key.toLowerCase(), field]),
) as Record<string, ObjectiveShortcutField>;

/**
 * The field a keystroke opens, or null when it is not an objective shortcut
 * here: a modifier or key repeat, a keystroke typed in a field, or a field the
 * surface does not offer.
 */
export function objectiveShortcutField(
  e: Pick<KeyboardEvent, "key" | "repeat" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "target">,
  fields: readonly ObjectiveShortcutField[],
): ObjectiveShortcutField | null {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
  if (isTypingTarget(e.target)) return null;
  const field = FIELD_FOR_KEY[eventKey(e)];
  return field && fields.includes(field) ? field : null;
}

/**
 * Opens an objective picker from its key while `enabled`.
 *
 * With `scope` (the dialog's content), only keystrokes from inside it count: a
 * dialog stacked on top, or a portaled picker, keeps its keys. Without it (the
 * objective page), any open dialog or popover holds the keyboard instead.
 */
export function useObjectiveFieldShortcuts({
  enabled,
  fields,
  onField,
  scope,
}: {
  enabled: boolean;
  fields: readonly ObjectiveShortcutField[];
  onField: (field: ObjectiveShortcutField) => void;
  scope?: RefObject<HTMLElement | null>;
}): void {
  const latest = useRef({ fields, onField, scope });
  latest.current = { fields, onField, scope };

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const { fields, onField, scope } = latest.current;
      const field = objectiveShortcutField(e, fields);
      if (!field) return;
      if (scope) {
        // Like the create-issue dialog: an unattached ref (the mobile drawer
        // does not forward it) does not block the keys.
        const target = e.target as Node | null;
        if (scope.current && target && !scope.current.contains(target)) return;
      } else if (hasVisibleOpenDialog()) {
        return;
      }
      e.preventDefault();
      // C must not also reach the app-wide "new issue" listener.
      e.stopPropagation();
      onField(field);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}
