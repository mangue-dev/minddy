interface WindowTarget {
  isDestroyed: () => boolean;
  loadURL: (url: string) => Promise<unknown>;
}

/** Native failure events own recovery; consume expected navigation rejections. */
export function loadDesktopWindow(target: WindowTarget, url: string): void {
  if (target.isDestroyed()) return;
  try {
    // Electron rejects both replaced navigations and unreachable remote loads.
    // Neither should become an unhandled rejection in the shell process.
    void target.loadURL(url).catch(() => {});
  } catch {
    // A window may be disposed between selecting it and initiating the load.
  }
}
