/** x mirrors y so the controls sit at the same distance from both window edges. */
export const MACOS_TRAFFIC_LIGHT_POSITION = { x: 15, y: 15 } as const;

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
    titleBarOverlay: { color: "#191a1b", symbolColor: "#eeeeee", height: 44 },
    autoHideMenuBar: true,
  };
}
