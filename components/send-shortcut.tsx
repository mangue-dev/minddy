"use client";

// The SEND shortcut, said only once for the entire application.
//
// Wherever you write a message — compose it from Numo, a comment from
// ticket, a line remark on a pull request, a team response, a
// public return — it's ⌘/Ctrl + Enter which sends it, and Enter only which passes
// at the line. A composition where you write several sentences cannot leave
// on the button used to breathe.
//
// Since MIN-287 it is a DEFAULT and no longer a law: Account → Preferences
// allows sending to enter only. The legend therefore follows the account —
// and only where the key follows it too, hence `scope` below.
//
// The counterpart of a sending which is no longer on Enter is that it is no longer
// guess more: the gesture must be READ when hovering over the button that executes it. Hence
// these two components rather than a `title` copied ten times — the day the
// when the shortcut changes, it changes here.
//
// The key follows the platform (`useModKey`): “⌘” on a Mac, “Ctrl”
// elsewhere. Two separate pellets, like the search pill renders “⌘ K”:
// “⌘↵” in a single would read as a single key.

import type { ReactElement } from "react";
import { Kbd } from "@/components/ui/kbd";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
import { useSendMode } from "@/lib/keyboard/use-send-mode";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** True if the keyboard event is the send shortcut. Only one place decides
 what "send to keyboard" means, both on the key and legend sides —
 this place is [lib/keyboard/send-shortcut.ts], re-exported here so that the
 surfaces that render the legend only have to do one import. */
export { isSendShortcut } from "@/lib/keyboard/send-shortcut";

/**
 * On which side of the setting is the button being captioned.
 *
 * - `composer` (the default): a message — comment, reply, prompt, return.
 * The account preference applies, the caption follows it;
 * - `form`: a form whose body is a PUBLISHER (create a ticket, a
 * objective, a view, a wizard step). Entry belongs to the paragraph
 * following whatever the account has chosen, so the legend remains “⌘ ↵”.
 */
export type SendShortcutScope = "composer" | "form";

/** The send key(s), as carried by the platform keyboard
 and as set by the account. */
export function SendShortcutKeys({
  size = "sm",
  scope = "composer",
}: {
  size?: "sm" | "default";
  scope?: SendShortcutScope;
}) {
  const mod = useModKey();
  const mode = useSendMode();
  // Entry only: a single tablet. Say “⌘↵” to someone who chose Enter
  // would be exact (⌘↵ also sends) but would teach him the longest gesture.
  if (scope === "composer" && mode === "enter") {
    return <Kbd size={size}>↵</Kbd>;
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      <Kbd size={size}>{mod}</Kbd>
      <Kbd size={size}>↵</Kbd>
    </span>
  );
}

/**
 * The send button and its caption: “Comment ⌘ ↵”.
 *
 * The wording is that of the button itself — the repetition is intended, it is this
 * which makes the tooltip readable alone and allows a button as an icon (the round
 * sending Numo) to use exactly the same component.
 *
 * A native `<button disabled>` no longer emits pointer events: on a
 * disabled button the tooltip does not open. This is the correct behavior — the
 * shortcut wouldn't send anything either.
 */
export function SendShortcutTooltip({
  label,
  side = "top",
  scope = "composer",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  scope?: SendShortcutScope;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span className="inline-flex items-center gap-1.5">
          {label}
          <SendShortcutKeys scope={scope} />
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
