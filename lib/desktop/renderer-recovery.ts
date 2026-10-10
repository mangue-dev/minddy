import { desktopServerUnavailableHtml } from "./server-unavailable";

export function desktopRendererRecoveryHtml(
  origin: string,
  url: string,
  font?: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return desktopServerUnavailableHtml(origin, url, font, platform, {
    title: "Recover minddy",
    heading: "This window stopped working",
    explanation: "Reload this window to continue. Unsaved changes may be lost.",
    retryLabel: "Reload window",
  });
}

interface RendererRecoveryOptions {
  origin: () => string;
  unavailable: () => boolean;
  load: (origin: string, url: string) => Promise<unknown>;
  failed: () => void;
  defer: (work: () => void) => void;
}

/** One local recovery attempt per document, never an automatic remote reload. */
export function createRendererRecovery(options: RendererRecoveryOptions) {
  let lastUrl = "";
  let attempted = false;
  let navigation = 0;
  let failureReported = false;
  const failed = () => {
    if (!failureReported && !options.unavailable()) {
      failureReported = true;
      options.failed();
    }
  };
  return {
    navigationStarted(url: string, sameDocument: boolean) {
      try {
        if (new URL(url).origin !== new URL(options.origin()).origin) return;
        lastUrl = url;
        if (sameDocument) return;
        navigation++;
        attempted = false;
        failureReported = false;
      } catch { /* Local documents are not remote retry destinations. */ }
    },
    rendererGone(reason: string) {
      if (reason === "clean-exit" || options.unavailable()) return;
      const at = navigation;
      // Loading synchronously inside render-process-gone can crash Electron's
      // main process. Also let a newer navigation or quit cancel this work.
      options.defer(() => {
        if (at !== navigation || options.unavailable()) return;
        if (attempted) { failed(); return; }
        attempted = true;
        try {
          void options.load(options.origin(), lastUrl).catch(() => {
            if (at === navigation) failed();
          });
        } catch { failed(); }
      });
    },
  };
}
