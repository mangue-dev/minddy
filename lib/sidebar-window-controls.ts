/** Width occupied by the three native macOS window controls and their margin. */
export const WINDOW_BUTTONS_WIDTH = 84;

/** Height shared by the application titlebar surfaces. */
export const TITLEBAR_HEIGHT = 60;

/**
 * Whether a pointer left the primary sidebar through the native macOS controls.
 *
 * Platform identity is stable while the window-button visibility request is
 * asynchronous. Using the latter here creates a race while an expanding rail
 * asks Electron to restore the controls.
 */
export function isMacWindowControlsZone(
  platform: string | undefined,
  point: { clientX: number; clientY: number },
): boolean {
  return (
    platform === "darwin" &&
    point.clientX >= 0 &&
    point.clientX <= WINDOW_BUTTONS_WIDTH &&
    point.clientY >= 0 &&
    point.clientY <= TITLEBAR_HEIGHT
  );
}
