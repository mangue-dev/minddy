/**
 * Haptic feedback in the native mobile app (MIN-959).
 *
 * Two intensities, as iOS draws them:
 * - `selection`, a light tick, when a switch flips, a value is picked (a
 *   select, a segmented control, a date, a dropdown or ⌘K row, an editor
 *   suggestion) or something is copied. The native bottom bar plays its own
 *   tick.
 * - `success` and `error`, stronger, for key actions. Creating an issue or
 *   an objective plays `success` at once (`hapticOptimistic`): the item is
 *   already on screen. Completing an issue or sending a comment plays it on
 *   the server's answer (`hapticOutcome`). Either plays `error` on failure.
 *
 * The shell plays them (`MinddyShell.haptic`), so a browser, the desktop app
 * and an older shell do nothing. The account can turn every vibration off
 * (`user_metadata.haptics`, on by default); `HapticsAccountSync` mirrors that
 * switch here and into the shell.
 */
import { getMobileBridge, type MobileHapticKind } from "@/lib/mobile/bridge";

export type HapticKind = MobileHapticKind;

/** The `user_metadata` key of the account switch. */
export const HAPTICS_META_KEY = "haptics";

/** On unless the account turned it off. */
export function resolveHaptics(meta: Record<string, unknown> | null | undefined): boolean {
  return meta?.[HAPTICS_META_KEY] !== false;
}

/**
 * The same kind again within this window is dropped: marking twenty issues
 * done at once, or a Select that reports its value twice, vibrates once.
 */
export const HAPTIC_COALESCE_MS = 120;

let enabled = true;
const lastPlayed = new Map<HapticKind, number>();

/** Mirrors the account switch, here and in the shell's native bar. */
export function setHapticsEnabled(next: boolean): void {
  enabled = next;
  void getMobileBridge()?.shell?.setHaptics?.({ enabled: next }).catch(() => {});
}

/** Plays one haptic in the native app; does nothing anywhere else. */
export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  const shell = getMobileBridge()?.shell;
  if (!shell?.haptic) return;
  const now = Date.now();
  const last = lastPlayed.get(kind);
  if (last !== undefined && now - last < HAPTIC_COALESCE_MS) return;
  lastPlayed.set(kind, now);
  void shell.haptic({ kind }).catch(() => {});
}

/** Plays `success` when `work` resolves and `error` when it rejects; returns `work`. */
export function hapticOutcome<T>(work: Promise<T>): Promise<T> {
  work.then(() => haptic("success"), () => haptic("error"));
  return work;
}

/**
 * Plays `success` at once, for a write the interface already shows (a
 * created issue or objective appears before the server answers, and Smart
 * Fill may take seconds), then `error` if `work` rejects. Returns `work`.
 */
export function hapticOptimistic<T>(work: Promise<T>): Promise<T> {
  haptic("success");
  work.then(undefined, () => haptic("error"));
  return work;
}

/**
 * Plays `selection` after every successful copy to the clipboard, from any
 * button: the app copies from some thirty places (prompts, links, code,
 * identifiers), all through `navigator.clipboard`. Installed only in a shell
 * that can vibrate; returns what undoes it.
 */
export function installClipboardHaptics(): () => void {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard || !getMobileBridge()?.shell?.haptic) return () => {};
  const writeText = clipboard.writeText;
  const write = clipboard.write;
  const played = <T>(copy: Promise<T>): Promise<T> => {
    copy.then(() => haptic("selection"), () => {});
    return copy;
  };
  clipboard.writeText = (text: string) => played(writeText.call(clipboard, text));
  if (write) clipboard.write = (items: ClipboardItems) => played(write.call(clipboard, items));
  return () => {
    clipboard.writeText = writeText;
    if (write) clipboard.write = write;
  };
}

/** Restores the defaults between tests. */
export function resetHapticsForTests(): void {
  enabled = true;
  lastPlayed.clear();
}
