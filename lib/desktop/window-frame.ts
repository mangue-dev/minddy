export const MACOS_TRAFFIC_LIGHT_POSITION = { x: 19, y: 15 } as const;

export type DesktopWindowFrameOptions =
  | {
      titleBarStyle: "hidden";
      trafficLightPosition: typeof MACOS_TRAFFIC_LIGHT_POSITION;
    }
  | {
      titleBarStyle: "hidden";
      titleBarOverlay: { color: string; symbolColor: string; height: number };
      autoHideMenuBar: true;
    };

/** Integrate native caption controls into the shared 44 px application bar. */
export function desktopWindowFrameOptions(
  platform: NodeJS.Platform
): DesktopWindowFrameOptions {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hidden",
      trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
    };
  }

  return {
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#191a1b", symbolColor: "#eeeeee", height: 44 },
    autoHideMenuBar: true,
  };
}
