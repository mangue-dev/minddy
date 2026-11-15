/**
 * What the main process tells a window's preload when it creates the window.
 *
 * The bridge is a plain object, not a promise: these values must be there
 * before the page's first render, and a sandboxed preload has no environment
 * to read. They travel on the renderer command line
 * (`webPreferences.additionalArguments`), already in `process.argv` when the
 * preload runs, without an IPC round trip at startup.
 */

import {
  isDesktopNotificationCapabilities,
  UNSUPPORTED_NOTIFICATION_CAPABILITIES,
  type DesktopNotificationCapabilities,
} from "./notification-capabilities";
import { isDesktopWindowMaterialState, type DesktopWindowMaterialState } from "./window-material";

export interface DesktopLaunchState {
  /** `app.getVersion()`. */
  version: string;
  /** Whether the page draws the window's caption controls area itself. */
  integratedWindowChrome: boolean;
  notificationCapabilities: DesktopNotificationCapabilities;
  /** The window material when the window was created (MIN-810). */
  windowMaterial: DesktopWindowMaterialState | null;
}

const LAUNCH_STATE_FLAG = "--minddy-launch=";

export function desktopLaunchFlag(state: DesktopLaunchState): string {
  return `${LAUNCH_STATE_FLAG}${encodeURIComponent(JSON.stringify(state))}`;
}

/** Reads the flag back in the preload; a missing or malformed field takes its most limited value. */
export function parseDesktopLaunchState(argv: readonly string[]): DesktopLaunchState {
  const raw = argv.find((arg) => arg.startsWith(LAUNCH_STATE_FLAG))?.slice(LAUNCH_STATE_FLAG.length);
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(decodeURIComponent(raw)) : null;
    if (typeof parsed === "object" && parsed !== null) value = parsed as Record<string, unknown>;
  } catch {
    // Treated as an absent flag.
  }
  return {
    version: typeof value.version === "string" ? value.version : "",
    integratedWindowChrome: value.integratedWindowChrome === true,
    notificationCapabilities: isDesktopNotificationCapabilities(value.notificationCapabilities)
      ? value.notificationCapabilities
      : UNSUPPORTED_NOTIFICATION_CAPABILITIES,
    windowMaterial: isDesktopWindowMaterialState(value.windowMaterial) ? value.windowMaterial : null,
  };
}
