/**
 * Electron test bench only: open windows without taking focus.
 *
 * Automated performance runs launch the unpackaged shell many times in a row.
 * Each launch used to show its window with `show()` and `focus()`, which
 * activates the app and pulls the person away from whatever they were doing.
 * With `MINDDY_DESKTOP_TEST_BACKGROUND=1`, the shell shows its windows with
 * `showInactive()` and runs as a macOS accessory app (no Dock icon, no
 * activation). The window stays visible, so rendering is not throttled the way
 * a hidden window would be.
 *
 * A packaged app always ignores the variable, even if its environment carries
 * it, exactly like `MINDDY_DESKTOP_TEST_USER_DATA`.
 *
 * PURE module: the rule is tested here; `desktop/src/main.ts` applies it.
 */
export function desktopTestBackground(
  isPackaged: boolean,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return !isPackaged && env.MINDDY_DESKTOP_TEST_BACKGROUND?.trim() === "1";
}
