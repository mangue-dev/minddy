/**
 * ⌘Q WHILE A TURN IS TURNING (MIN-293) — the half that decides without a window.
 *
 * ## What changes, and why this gesture becomes dangerous
 *
 * Today `before-quit` destroys the window **without asking anything**
 * ([main.ts](../../desktop/src/main.ts)): the shell is a window on an
 * origin, quitting loses nothing that a reload does not return. As soon as a turn plays
 * here, the same move becomes **the main cause of loss of a turn** — and
 * a loss that costs, since a turn can have hours of work behind
 * it and a pull request in front.
 *
 * ## The turn MUST die with the app, and this is not negotiable
 *
 * We therefore do not suggest “exit while leaving it running”. A detached harness that
 * survives ⌘Q would keep a forge token `contents: write` and a
 * template key alive, **with no more interface to stop them** — and a process
 * repaired to `launchd` **loses its TCC responsible process**, so the macOS permission window wouldn't even open at the first protected folder.
 * Two halves of the same argument: what makes the local tenable is that the app is the only thing holding up.
 *
 * The choice offered is therefore binary, and the wording says it: **stop the round
 * and exit**, or **stay**.
 *
 * ## Where the session restarts
 *
 * A stopped round is not a lost round: the supervisor saves his
 * checkpoint every two minutes, and the watchdog will put the session back to rest on that checkpoint. This is what the box should say — otherwise
 * someone will cancel a legitimate ⌘Q for fear of losing an hour of work.
 *
 * In English, like the menu and diagnostic report: it's a NATIVE box,
 * outside of next-intl, and the rest of the native surfaces are already English.
 */

/** Ce qu'on sait des tours en cours au moment du ⌘Q. */
export interface RunningTurn {
  readonly runId: string;
  /** What to name the trick in the box — `MIN-293`, or the folder failing that. */
  readonly label?: string;
}

/** The box, as `dialog.showMessageBox` wants it. */
export interface QuitPrompt {
  readonly message: string;
  readonly detail: string;
  /** `[0]` leaves, `[1]` stays. The order is taken over by `quitDecision`. */
  readonly buttons: readonly [string, string];
  readonly defaultId: 0 | 1;
  readonly cancelId: 0 | 1;
}

/**
 * SHOULD YOU ASK? `null` = no, we exit as before.
 *
 * Without a turn in progress, the shell returns to what it is for the rest of the time:
 * a window, the closing of which costs nothing. A box at each ⌘Q would be the
 * kind of addition that we learn to click without reading — and the day it counts
 * really, it would no longer count.
 */
export function quitPrompt(running: readonly RunningTurn[]): QuitPrompt | null {
  if (running.length === 0) return null;

  const one = running.length === 1;
  const named = running[0]?.label;
  const subject = one ? (named ? `“${named}”` : "an agent turn") : `${running.length} agent turns`;

  return {
    message: `Quit minddy and stop ${subject}?`,
    detail:
      (one
        ? "This turn is running on this Mac, and it cannot keep going without the app: "
        : "These turns are running on this Mac, and they cannot keep going without the app: ") +
      "minddy holds the repository token and the model key for as long as it runs, and nothing " +
      "outside the app could stop them.\n\n" +
      (one
        ? "The session is saved every couple of minutes — reopen minddy and send a message to carry on from the last save."
        : "The sessions are saved every couple of minutes — reopen minddy and send a message to carry on from the last save."),
    // The destructive gesture first, like everywhere on macOS; the defect is
    // the SAFE button, and this is also what an Escape triggers.
    buttons: ["Stop and Quit", "Keep Working"],
    defaultId: 1,
    cancelId: 1,
  };
}

export type QuitDecision = "quit" | "stay";

/**
 * What the click means. Trivial, and still written: an inverted
 * button index here would cause the app to exit to "Keep Working", and that's exactly the
 * kind of mistake that no type can catch.
 *
 * Anything other than button 0 is worth "stay" — a box closed by the
 * system, an out-of-bounds `response`, an Escape
 */
export function quitDecision(response: number): QuitDecision {
  return response === 0 ? "quit" : "stay";
}

/**
 * The final word written in the log of the turns that we stop.
 *
 * It counts more than it seems: it is the only line which distinguishes "the
 * harness crashed" from "someone left the app", and the two are read
 * otherwise in a diagnostic report.
 */
export function quitLogNote(): string {
  return "stopped because minddy was quit — the session resumes from its last save";
}
