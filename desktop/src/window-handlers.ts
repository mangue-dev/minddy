import { sendDesktopEvent, type DesktopIpcHandlers, type DesktopIpcTarget } from "@/lib/desktop/ipc-main";
import { desktopTitleBarOverlay } from "@/lib/desktop/window-frame";
import { windowMaterialForWindow, type DesktopWindowMaterialState } from "@/lib/desktop/window-material";

/** The parts of the main `BrowserWindow` these channels touch. */
export interface ShellWindowLike {
  isFullScreen(): boolean;
  setTitleBarOverlay(options: ReturnType<typeof desktopTitleBarOverlay>): void;
}

interface WindowDependencies<S> {
  platform: NodeJS.Platform;
  mainWindow: () => ShellWindowLike | null;
  /** Whether the main window was created with integrated caption controls (Windows and Linux). */
  integratedFrame: () => boolean;
  /** Electron's `nativeTheme`. */
  nativeTheme: { themeSource: "system" | "light" | "dark" };
  /** The material in force for every window, before full screen (MIN-810). */
  currentMaterial: () => DesktopWindowMaterialState;
  materialEnabled: () => boolean;
  /** Saves the device preference and repaints every window. */
  setMaterialEnabled: (enabled: boolean) => void;
  /** Whether the sender's window is in full screen, `false` without one. */
  senderFullScreen: (sender: S) => boolean;
  /** The macOS window buttons, hidden in full screen. */
  windowButtonsVisible: () => boolean;
  /** Shows the main window and gives it focus. */
  focus: () => void;
}

type WindowChannel =
  | "minddy:window-chrome"
  | "minddy:window-material:set"
  | "minddy:window-material-state"
  | "minddy:window-buttons-state"
  | "minddy:focus"
  | "minddy:storage:flush";

/** The window around the page: its appearance, material, buttons, focus and storage. */
export function windowHandlers<
  E extends { sender: DesktopIpcTarget & { session: { flushStorageData(): void } } },
>(deps: WindowDependencies<E["sender"]>): Pick<DesktopIpcHandlers<E>, WindowChannel> {
  return {
    "minddy:window-chrome": (_event, theme, followsSystem) => {
      const window = deps.mainWindow();
      if (!window) return;
      // The native material is tinted by the app's appearance, not the
      // page's: it follows the page's theme, or dark text lands on a dark
      // blur. A page that follows the system leaves the app on the system,
      // so its own `prefers-color-scheme` keeps tracking the OS. Older pages
      // send no second argument and keep the previous behavior.
      if (followsSystem !== undefined) {
        const source = followsSystem ? "system" : theme;
        if (deps.nativeTheme.themeSource !== source) deps.nativeTheme.themeSource = source;
      }
      if (deps.platform === "darwin" || !deps.integratedFrame()) return;
      window.setTitleBarOverlay(desktopTitleBarOverlay(deps.platform, theme));
    },
    "minddy:window-material:set": (_event, enabled) => {
      if (enabled !== deps.materialEnabled()) deps.setMaterialEnabled(enabled);
      return windowMaterialForWindow(deps.currentMaterial(), deps.mainWindow()?.isFullScreen() ?? false);
    },
    "minddy:window-material-state": {
      ready: ({ sender }) =>
        sendDesktopEvent(
          sender,
          "minddy:window-material-state",
          windowMaterialForWindow(deps.currentMaterial(), deps.senderFullScreen(sender)),
        ),
    },
    "minddy:window-buttons-state": {
      ready: ({ sender }) => sendDesktopEvent(sender, "minddy:window-buttons-state", deps.windowButtonsVisible()),
    },
    "minddy:focus": () => deps.focus(),
    // Chromium defers DOM storage commits by several seconds; a forced quit
    // in that window loses an acknowledged local draft.
    "minddy:storage:flush": ({ sender }) => {
      sender.session.flushStorageData();
    },
  };
}
