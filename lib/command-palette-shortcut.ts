import { eventKey } from "@/lib/keyboard/event-key";

export type CommandPaletteShortcut = "toggle" | "open" | null;

/** Resolve only the global shortcuts that must work before the palette chunk loads. */
export function commandPaletteShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "target"
  >,
): CommandPaletteShortcut {
  const isMod = event.metaKey || event.ctrlKey;
  const key = eventKey(event);
  if (isMod && !event.shiftKey && !event.altKey && (key === "k" || key === "p")) {
    return "toggle";
  }
  if (isMod || event.altKey || key !== "f") return null;

  const target = event.target as HTMLElement | null;
  const typing =
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable);
  return typing ? null : "open";
}
