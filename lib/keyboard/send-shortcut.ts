/**
 * The SEND shortcut, said only once for the entire application.
 *
 * Two modes, and only one is an account choice:
 *
 * - `mod-enter` (the default, the one always): ⌘/Ctrl + Enter send, Enter
 * only line pass. This is what is needed in a composition where one writes
 *   plusieurs phrases ;
 * - `enter`: Entry sends. For those who come from Slack and type short.
 *
 * **⌘/Ctrl + Enter sends in BOTH modes.** The setting adds a key,
 * he does not remove it: the muscle memory of the one who tips continues to
 * walk, and a “⌘↵” caption left somewhere never becomes false.
 *
 * **Shift + Enter is not in NONE.** It is the newline key, in
 * both modes and without exception — in `enter` because it is the only one which
 * remains to breathe, in `mod-enter` because a ⌘⇧Entrance left by mistake is
 * exactement ce qu'on ne veut pas d'un geste d'envoi.
 *
 * The rule lives here, outside of any component, for two reasons: it is pure —
 * it can be tested without mounting a DOM — and the surfaces that READ it (the tooltip
 * and the pellets of [components/send-shortcut.tsx]) pull mango-ui behind
 * them, which a test node has no use for. The two halves of the gesture remain
 * therefore united, without the key depending on the covering.
 *
 * This module does not depend on ANYTHING (neither React nor Supabase): composers read it
 * client side via [use-send-mode.ts](use-send-mode.ts), the settings screen
 * writes it. This is the only definition of “send to keyboard”.
 */

/** The two modes, in the order in which the settings screen offers them. */
export const SEND_MODES = ["mod-enter", "enter"] as const;

export type SendMode = (typeof SEND_MODES)[number];

/** The historical mode, and that of an account which chose nothing. */
export const DEFAULT_SEND_MODE: SendMode = "mod-enter";

/** The key to `user_metadata` Supabase where preference lives, like its neighbors
    (`smart_fill`, `numo_default_status`, …). */
export const SEND_MODE_META_KEY = "send_shortcut";

export const isSendMode = (v: unknown): v is SendMode =>
  typeof v === "string" && (SEND_MODES as readonly string[]).includes(v);

/** The method of sending the account, read in its `user_metadata`. An absence — an
    account nine has no metadata at all — reads like the default. */
export function resolveSendMode(
  meta: Record<string, unknown> | null | undefined,
): SendMode {
  const value = meta?.[SEND_MODE_META_KEY];
  return isSendMode(value) ? value : DEFAULT_SEND_MODE;
}

/**
 * Is keyboard event the send shortcut?
 *
 * `mode` defaults to `mod-enter`: surfaces that do NOT know the
 * account (forms, where Enter belongs to the description editor;
 * a public board, where there is no account) call it without argument and
 * keep the contract forever.
 */
export function isSendShortcut(
  e: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  },
  mode: SendMode = DEFAULT_SEND_MODE,
): boolean {
  if (e.key !== "Enter") return false;
  // Shift+Enter skips the line, always — that's what makes `enter` mode
  // habitable, and it costs nothing in `mod-enter` mode.
  if (e.shiftKey) return false;
  if (e.metaKey || e.ctrlKey) return true;
  // ⌥Input remains with the editor (soft line break): `enter` mode does not take
  // than NUE typing.
  return mode === "enter" && !e.altKey;
}
