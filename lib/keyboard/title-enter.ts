import { isSendShortcut, type SendMode } from "@/lib/keyboard/send-shortcut";

/**
 * Enter in a TITLE stacked over its description (MIN-756): what it does,
 * decided outside of any DOM.
 *
 * The title is the line above the description's first line, so Enter does
 * what it does at the end of any line: it goes to the next one (`jump`).
 * Two exceptions, both about sending:
 *
 * - on a CREATION surface, the account's send shortcut submits — ⌘/Ctrl +
 *   Enter always, plain Enter only for an account that sends with Enter;
 * - on an EDIT surface (a panel) there is nothing to send: ⌘/Ctrl + Enter
 *   only leaves the field (`blur`), which saves the title.
 *
 * Shift + Enter is never a send gesture (see send-shortcut.ts): it always
 * jumps. On a phone, the keyboard's Enter is the “next” key of the field.
 */
export type TitleEnterPlan = "ignore" | "jump" | "submit" | "blur";

export function planTitleEnter(
  e: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    isComposing?: boolean;
  },
  state: {
    mode: SendMode;
    /** The surface creates something; absent on edit surfaces. */
    canSubmit: boolean;
    mobile?: boolean;
  },
): TitleEnterPlan {
  // An IME composition commits its text with Enter.
  if (e.key !== "Enter" || e.isComposing) return "ignore";
  const modified = e.metaKey || e.ctrlKey;
  if (!state.canSubmit) return modified && !e.shiftKey ? "blur" : "jump";
  if (state.mobile && !modified) return "jump";
  return isSendShortcut(e, state.mode) ? "submit" : "jump";
}
