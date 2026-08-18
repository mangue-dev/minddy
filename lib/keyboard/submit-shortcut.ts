import { isSendShortcut } from "@/lib/keyboard/send-shortcut";

/**
 * ⌘/Ctrl + Enter in a FORM: what the shortcut should do, decided
 * outside of any DOM to remain readable and testable.
 *
 * The gesture does not call the submit function: it **clicks the main
 * button**. This is what keeps it aligned with what the screen shows — a grayed out
 * button (empty title, sending in progress, attachment still in flight) does not
 * activate on the keyboard any more than on the mouse, without any of these conditions
 * having to be copied here.
 *
 * `blur-then-click` is the subtlety that counts. Our description editors
 * (tiptap) only go back their markdown to the BLUR: clicking the button while the caret is still in would send the description as it was
 * to the last blur — that is to say, on a ticket that we have just written, empty. On
 * therefore leaves the field first, and we click on the next turn.
 */
export type SubmitShortcutPlan = "ignore" | "click" | "blur-then-click";

export function planSubmitShortcut(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; defaultPrevented?: boolean },
  state: {
    /** The form has an actionable `button[type=submit]`. */
    hasEnabledSubmit: boolean;
    /** The focus is in a contenteditable surface of this form. */
    activeIsEditor: boolean;
  }
): SubmitShortcutPlan {
  if (e.defaultPrevented) return "ignore";
  if (!isSendShortcut(e)) return "ignore";
  // No button, or a grayed out button: we do NOTHING, and above all we do not
  // confiscate not typing — ⌘Input remains hard tiptap line break there
  // where there is nothing to create.
  if (!state.hasEnabledSubmit) return "ignore";
  return state.activeIsEditor ? "blur-then-click" : "click";
}
