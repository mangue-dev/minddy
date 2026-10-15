/** x mirrors y so the controls sit at the same distance from both window edges. */
export const MACOS_TRAFFIC_LIGHT_POSITION = { x: 15, y: 15 } as const;

/** Windows controls reveal the CSS surface beneath them, including theme changes. */
export function desktopTitleBarOverlay(
  platform: NodeJS.Platform,
  theme: "light" | "dark" = "dark",
): { color: string; symbolColor: string; height: number } {
  return {
    color: platform === "win32" ? "#00000000" : theme === "dark" ? "#191a1b" : "#fafafa",
    symbolColor: theme === "dark" ? "#eeeeee" : "#222222",
    height: 44,
  };
}

export type DesktopWindowFrameOptions =
  | { autoHideMenuBar: true }
  | {
      titleBarStyle: "hidden";
      trafficLightPosition: typeof MACOS_TRAFFIC_LIGHT_POSITION;
    }
  | {
      titleBarStyle: "hidden";
      titleBarOverlay: { color: string; symbolColor: string; height: number };
      autoHideMenuBar: true;
    };

export const DESKTOP_CHROME_HEADER = "x-minddy-desktop-chrome";
export const DESKTOP_CHROME_VERSION = "1";

/** Only a main document served by the selected origin can opt into the overlay. */
export function desktopDocumentChrome(details: {
  url: string; resourceType: string; statusCode: number;
  responseHeaders?: Record<string, string[]>;
}, origin: string): boolean | null {
  if (details.resourceType !== "mainFrame" || details.statusCode < 200 || (details.statusCode >= 300 && details.statusCode < 400)) return null;
  if (new URL(details.url).origin !== new URL(origin).origin) return null;
  return Object.entries(details.responseHeaders ?? {}).some(([name, values]) =>
    name.toLowerCase() === DESKTOP_CHROME_HEADER && values.includes(DESKTOP_CHROME_VERSION));
}

/** Older remote renderers keep a native frame until their document opts in. */
export function desktopWindowFrameOptions(
  platform: NodeJS.Platform,
  integrated = false,
): DesktopWindowFrameOptions {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hidden",
      trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
    };
  }

  if (!integrated) return { autoHideMenuBar: true };

  return {
    titleBarStyle: "hidden",
    titleBarOverlay: desktopTitleBarOverlay(platform),
    autoHideMenuBar: true,
  };
}

/**
 * The frame the last main document of an origin asked for, kept across
 * launches. It is an observation of that origin's own response, never a
 * capability inferred from its name or from the app version.
 */
export interface RememberedWindowChrome {
  origin: string;
  integrated: boolean;
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** A remembered observation read from disk; anything malformed is forgotten. */
export function parseRememberedWindowChrome(raw: unknown): RememberedWindowChrome | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { origin, integrated } = raw as { origin?: unknown; integrated?: unknown };
  if (typeof origin !== "string" || typeof integrated !== "boolean") return null;
  const normalized = originOf(origin);
  return normalized ? { origin: normalized, integrated } : null;
}

/**
 * What a successful main document tells about the next launch. Error pages
 * say nothing about the renderer's capability, so only a 2xx is remembered.
 */
export function rememberableWindowChrome(details: {
  url: string; resourceType: string; statusCode: number;
  responseHeaders?: Record<string, string[]>;
}, origin: string): RememberedWindowChrome | null {
  const integrated = desktopDocumentChrome(details, origin);
  const normalized = originOf(origin);
  if (integrated === null || details.statusCode >= 300 || !normalized) return null;
  return { origin: normalized, integrated };
}

/**
 * The frame of the first window. Frame style is a constructor option, so a
 * Windows or Linux window created with the wrong one is replaced, and its
 * document loaded a second time. Reusing the last observation of the SAME
 * origin avoids that on every launch after the first; another origin
 * (channel switch, custom server, local runtime) starts native as before.
 * macOS has a single frame.
 */
export function startupIntegratedChrome(
  platform: NodeJS.Platform,
  remembered: RememberedWindowChrome | null,
  origin: string,
): boolean {
  if (platform === "darwin" || !remembered) return false;
  return remembered.integrated && remembered.origin === originOf(origin);
}

/**
 * The frame a loaded window must be replaced with, or null when it already
 * has the one its document asked for. A document that said nothing keeps the
 * current frame.
 */
export function windowChromeReplacement(
  observed: boolean | undefined,
  integrated: boolean,
): boolean | null {
  const desired = observed ?? integrated;
  return desired === integrated ? null : desired;
}
