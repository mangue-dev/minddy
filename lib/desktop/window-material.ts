/**
 * The native material behind the desktop window's chrome (MIN-810).
 *
 * The window itself is transparent and the system paints a blurred view of
 * the desktop behind it: vibrancy on macOS, Acrylic on Windows 11. The page
 * then leaves its chrome (sidebar, tab strip, bottom band) transparent and
 * keeps the content pane opaque. Everything else keeps the opaque window it
 * always had.
 *
 * Pure so that the platform decision is tested without Electron: the main
 * process feeds it `process.platform` and `os.release()`, and hands the result
 * to each new window in its launch state (launch-state.ts).
 */

/** What the system paints behind the page; `none` is the opaque window. */
export type DesktopWindowMaterialKind = "vibrancy" | "acrylic" | "none";

/**
 * The device preference and what the system allows, as the settings screen
 * needs them: `supported` shows the option, `reducedTransparency` disables it,
 * and `kind` is the material actually in force.
 */
export interface DesktopWindowMaterialState {
  supported: boolean;
  enabled: boolean;
  reducedTransparency: boolean;
  kind: DesktopWindowMaterialKind;
}

/**
 * `backgroundMaterial` is only honored from Windows 11 22H2 (build 22621),
 * where DWM exposes the system backdrop attribute. Older builds, Windows 10
 * included, keep the opaque window rather than a half-working effect.
 */
const WINDOWS_BACKDROP_BUILD = 22621;

/** The material this platform can paint at all, before any preference. */
export function supportedWindowMaterial(
  platform: NodeJS.Platform,
  osRelease: string,
): Exclude<DesktopWindowMaterialKind, "none"> | null {
  if (platform === "darwin") return "vibrancy";
  if (platform === "win32") {
    const build = Number(osRelease.split(".")[2]);
    return Number.isInteger(build) && build >= WINDOWS_BACKDROP_BUILD ? "acrylic" : null;
  }
  // Electron exposes no blur on Linux: a transparent window would only show
  // the desktop unblurred behind the text.
  return null;
}

/**
 * The material in force. The system's reduced-transparency or high-contrast
 * setting wins over the preference, whatever it says.
 */
export function desktopWindowMaterial(
  platform: NodeJS.Platform,
  osRelease: string,
  { enabled, reducedTransparency }: { enabled: boolean; reducedTransparency: boolean },
): DesktopWindowMaterialState {
  const material = supportedWindowMaterial(platform, osRelease);
  return {
    supported: material !== null,
    enabled,
    reducedTransparency,
    kind: material && enabled && !reducedTransparency ? material : "none",
  };
}

/**
 * The material of one window. A full-screen window has no desktop behind it
 * to show, only the black of its Space, so it keeps the opaque window until
 * it leaves full screen, whatever the preference says.
 */
export function windowMaterialForWindow(
  state: DesktopWindowMaterialState,
  fullScreen: boolean,
): DesktopWindowMaterialState {
  return fullScreen && state.kind !== "none" ? { ...state, kind: "none" } : state;
}

/** The window's opaque color, unchanged from the window without material. */
export const OPAQUE_WINDOW_BACKGROUND = "#000000";
/** A fully transparent window lets the native material show through. */
export const TRANSPARENT_WINDOW_BACKGROUND = "#00000000";

/** `BrowserWindow` constructor options for a material. */
export function windowMaterialOptions(kind: DesktopWindowMaterialKind):
  | { backgroundColor: string }
  | { backgroundColor: string; vibrancy: "sidebar"; visualEffectState: "followWindow" }
  | { backgroundColor: string; backgroundMaterial: "acrylic" } {
  if (kind === "vibrancy") {
    return {
      backgroundColor: TRANSPARENT_WINDOW_BACKGROUND,
      vibrancy: "sidebar",
      // An inactive window dims its material like every native sidebar.
      visualEffectState: "followWindow",
    };
  }
  if (kind === "acrylic") {
    return { backgroundColor: TRANSPARENT_WINDOW_BACKGROUND, backgroundMaterial: "acrylic" };
  }
  return { backgroundColor: OPAQUE_WINDOW_BACKGROUND };
}

/** The preference read from disk: anything but an explicit `false` keeps the effect. */
export function parseWindowMaterialPreference(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return true;
  return (raw as { enabled?: unknown }).enabled !== false;
}

/** Validates a state received over IPC or the command line before it reaches the page. */
export function isDesktopWindowMaterialState(value: unknown): value is DesktopWindowMaterialState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (state.kind === "vibrancy" || state.kind === "acrylic" || state.kind === "none")
    && typeof state.supported === "boolean"
    && typeof state.enabled === "boolean"
    && typeof state.reducedTransparency === "boolean";
}
