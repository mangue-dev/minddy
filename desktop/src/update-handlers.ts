import { WINDOWS_STORE_DEEP_LINK } from "@/lib/desktop/install-prompt";
import { sendDesktopEvent, type DesktopIpcHandlers, type DesktopIpcTarget } from "@/lib/desktop/ipc-main";

interface UpdateDependencies<S> {
  checkForUpdates: () => void | Promise<void>;
  /** Sends the updater's current status to one subscriber (updater.ts). */
  replayUpdateStatus: (sender: S) => void;
  requestInstall: () => void;
  /** Whether this is the Microsoft Store build, which the Store updates. */
  windowsStore: boolean;
  windowsStoreUpdateAvailable: () => boolean;
  openExternal: (url: string) => void;
}

type UpdateChannel =
  | "minddy:update:check"
  | "minddy:update-status"
  | "minddy:install-update"
  | "minddy:windows-store:open"
  | "minddy:windows-store-update-status";

/** The shell's own updates: electron-updater's, or the Microsoft Store's. */
export function updateHandlers<E extends { sender: DesktopIpcTarget }>(
  deps: UpdateDependencies<E["sender"]>,
): Pick<DesktopIpcHandlers<E>, UpdateChannel> {
  return {
    "minddy:update:check": () => deps.checkForUpdates(),
    "minddy:update-status": { ready: ({ sender }) => deps.replayUpdateStatus(sender) },
    // Reopens the native dialog, which asks for the last yes (updater.ts).
    "minddy:install-update": () => deps.requestInstall(),
    "minddy:windows-store:open": () => {
      if (deps.windowsStore) deps.openExternal(WINDOWS_STORE_DEEP_LINK);
    },
    "minddy:windows-store-update-status": {
      ready: ({ sender }) =>
        sendDesktopEvent(sender, "minddy:windows-store-update-status", deps.windowsStoreUpdateAvailable()),
    },
  };
}
