/**
 * The suggestion to install, once the update DOWNLOADED (MIN-353).
 *
 * ## What changes, and what does not change
 *
 * The rhythm remains that of `updater.ts`: we download alone, silently,
 * and **nothing is installed without a yes**. What this module adds is the
 * moment when we ask. Until now the installation was waiting for the next ⌘Q without
 * ever saying it - a desktop app which almost never quits (⌘W the
 * cache, it does not close it) therefore remained on its version for weeks, with
 * the new one already on the disk.
 *
 * ## Why “Install and Relaunch” and not “Restart Now”
 *
 * Because the sentence must say BOTH halves of what is going to happen. A
 * button which only promises a restart suggests that we will find the same
 * version; a button that only promises an installation suggests that we can
 * continue working for. This is the formula used by apps which
 * do it well, and it's not a coincidence.
 *
 * `Later` does not cancel anything: the update is there, `autoInstallOnAppQuit` the
 * will ask for the next one ⌘Q. That's why it's the ESCAPE
 * button (Escape, red light) — the default outcome of a dialog that we return without the
 * read should never be the one that interrupts the work.
 *
 * PUR module: `desktop/src/updater.ts` just opens the box and reads the
 * response.
 */

/** What `dialog.showMessageBox` expects, reduced to what we decide here. */
export interface UpdatePromptCopy {
  type: "info";
  message: string;
  detail: string;
  buttons: string[];
  /** The highlighted button, the one that ⏎ triggers. */
  defaultId: number;
  /** The one from Escape and the red light — never the installation. */
  cancelId: number;
}

export function updatePromptCopy(version: string): UpdatePromptCopy {
  return {
    type: "info",
    message: `minddy ${version} is ready to install.`,
    detail:
      "minddy will close and reopen — it takes a few seconds. If you’re in the middle of something, install it later and it will be applied the next time you quit minddy.",
    buttons: ["Install and Relaunch", "Later"],
    defaultId: 0,
    cancelId: 1,
  };
}

/**
 * What the answer means.
 *
 * **Anything that is not explicitly the first button is a `later`.**
 * `showMessageBox` returns `cancelId` when the box is closed without a choice, but
 * it can also return `-1` depending on how it is returned: we therefore do not
 * test “is it a refusal”, we test “is it a
 * yes”. An update that installs on a poorly closed dialog is
 * exactly what the default button is used to avoid.
 */
export function updatePromptChoice(response: number): "install" | "later" {
  return response === 0 ? "install" : "later";
}
