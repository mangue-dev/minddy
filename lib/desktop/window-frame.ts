export const MACOS_TRAFFIC_LIGHT_POSITION = { x: 19, y: 22 } as const;

export type DesktopWindowFrameOptions =
  | {
      titleBarStyle: "hidden";
      trafficLightPosition: typeof MACOS_TRAFFIC_LIGHT_POSITION;
    }
  | {
      frame: true;
      autoHideMenuBar: true;
    };

/** Keep integrated traffic lights on macOS and native window chrome elsewhere. */
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
    frame: true,
    autoHideMenuBar: true,
  };
}
