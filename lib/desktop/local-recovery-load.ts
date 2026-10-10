import type { EventEmitter } from "node:events";

type Target = Pick<EventEmitter, "on" | "removeListener"> & {
  getURL: () => string;
  loadURL: (url: string) => Promise<unknown>;
};

/** Electron's load promise can inherit a late abort from a replaced stream. */
export function loadLocalRecoveryDocument(target: Target, url: string) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => settle(new Error("Local recovery document timed out")), 15_000);
    function settle(error?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      target.removeListener("did-finish-load", finish);
      target.removeListener("did-fail-load", fail);
      target.removeListener("did-start-navigation", navigation);
      target.removeListener("destroyed", destroyed);
      target.removeListener("render-process-gone", destroyed);
      if (error) reject(error); else resolve();
    }
    const finish = () => { if (target.getURL() === url) settle(); };
    const fail = (_event: unknown, code: number, _description: string, validatedUrl: string, mainFrame: boolean) => {
      if (mainFrame && validatedUrl === url) settle(new Error(`Local recovery document failed (${code})`));
    };
    const navigation = (details: { url: string; isMainFrame: boolean; isSameDocument: boolean }) => {
      if (details.isMainFrame && !details.isSameDocument && details.url !== url) {
        settle(Object.assign(new Error("Local recovery navigation superseded"), { name: "AbortError" }));
      }
    };
    const destroyed = () => settle(new Error("Local recovery renderer unavailable"));
    target.on("did-finish-load", finish);
    target.on("did-fail-load", fail);
    target.on("did-start-navigation", navigation);
    target.on("destroyed", destroyed);
    target.on("render-process-gone", destroyed);
    try {
      void target.loadURL(url).then(finish).catch(error => {
        // Ignore only the abort inherited from another URL. Our own matched
        // finish/failure events and deadline still determine recovery success.
        if (error?.errno === -3 && error?.url !== url) return;
        settle(error);
      });
    } catch (error) { settle(error); }
  });
}
