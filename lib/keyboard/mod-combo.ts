import { eventKey } from "@/lib/keyboard/event-key";

/**
 * Is the keystroke EXACTLY “⌘/Ctrl + `key`”?
 *
 * “Exactly” is the word that counts: ⇧ or ⌥ in addition make ANOTHER shortcut,
 * and let ⌘⇧O pass on a rule “⌘ and the letter O” steals the combination
 * from the neighbor. This is the same rule as that of the dictation button (⌘⇧D must never go to ⌘D), released here to be readable and testable.
 *
 * Repetition is avoided: a shortcut that NAVIGATEs has nothing to do ten times
 * because we kept the key pressed.
 */
export function matchesModCombo(
  e: Pick<KeyboardEvent, "key" | "repeat" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  key: string
): boolean {
  if (e.repeat || e.shiftKey || e.altKey) return false;
  if (!(e.metaKey || e.ctrlKey)) return false;
  return eventKey(e) === key;
}

/**
 * Is the hit EXACTLY “⌘/Ctrl + ⇧ + `key`”?
 *
 * Same requirement as {@link matchesModCombo}, shifted up one notch: ⇧ is here
 * REQUIRED, ⌥ always refused. This is the form of the dictation shortcut (⌘⇧D), which
 * the dictation button carries wherever it is mounted and the global
 * voice creation shortcut picks up where no one took it.
 */
export function matchesModShiftCombo(
  e: Pick<KeyboardEvent, "key" | "repeat" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  key: string
): boolean {
  if (e.repeat || !e.shiftKey || e.altKey) return false;
  if (!(e.metaKey || e.ctrlKey)) return false;
  return eventKey(e) === key;
}
