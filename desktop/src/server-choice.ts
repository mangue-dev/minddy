import { readFile } from "node:fs/promises";
import path from "node:path";
import { ipcMain, protocol, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from "electron";

import {
  LOCAL_PREREQUISITES,
  LOCAL_PREREQUISITE_INFO,
  installMessage,
  type InstallMessage,
  type LocalInstallProgress,
  type LocalPrerequisiteId,
  type LocalPrerequisiteResult,
} from "@/lib/desktop/local-installer";
import {
  SERVER_CHOICE_FILES,
  SERVER_CHOICE_HOST,
  SERVER_CHOICE_SCHEME,
  isServerChoiceDocument,
  type DesktopServerChoiceState,
} from "@/lib/desktop/server-choice";
import { normalizeDesktopServerOrigin } from "@/lib/desktop/server-origin";

interface ServerChoiceDependencies {
  /** The main window's contents, the only renderer allowed to ask. */
  contents: () => WebContents | null;
  state: () => DesktopServerChoiceState;
  useCloud: () => void;
  connect: (origin: string) => void;
  useExistingInstallation: () => Promise<{ error?: InstallMessage }>;
  prerequisites: () => Promise<LocalPrerequisiteResult[]>;
  chooseInstallFolder: () => Promise<{ folder?: string; error?: InstallMessage }>;
  install: (report: (progress: LocalInstallProgress) => void) => Promise<{ error?: InstallMessage }>;
  cancelInstall: () => void;
  openExternal: (url: string) => void;
  close: () => void;
}

/**
 * The main-process side of the server-choice page (MIN-781).
 *
 * Every channel first checks WHO asks: the main window, its top frame, on the
 * app's own `minddy-app://welcome/`. Any server's page in the window, minddy
 * Cloud's included, gets nothing.
 */
export function registerServerChoiceIpc(deps: ServerChoiceDependencies): void {
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    const contents = deps.contents();
    const frame = event.senderFrame;
    return (
      contents !== null &&
      event.sender === contents &&
      frame !== null &&
      frame === contents.mainFrame &&
      isServerChoiceDocument(frame.url)
    );
  };

  ipcMain.handle("minddy:server-choice:state", (event) => (trusted(event) ? deps.state() : null));
  ipcMain.handle("minddy:server-choice:cloud", (event) => {
    if (trusted(event)) deps.useCloud();
  });
  ipcMain.handle("minddy:server-choice:connect", (event, raw: unknown) => {
    if (!trusted(event)) return { error: installMessage("localStartFailed") };
    try {
      deps.connect(normalizeDesktopServerOrigin(raw));
      return {};
    } catch {
      return { error: installMessage("serverInvalid") };
    }
  });
  ipcMain.handle("minddy:server-choice:existing", (event) => {
    if (!trusted(event)) return { error: installMessage("localStartFailed") };
    // Repeated clicks share one folder dialog and one startup
    // (`createLocalStartupSelection` behind `useExistingInstallation`).
    return deps.useExistingInstallation();
  });
  ipcMain.handle("minddy:server-choice:prerequisites", (event) => (trusted(event) ? deps.prerequisites() : []));
  ipcMain.handle("minddy:server-choice:choose-folder", (event) =>
    trusted(event) ? deps.chooseInstallFolder() : { error: installMessage("localStartFailed") },
  );
  ipcMain.handle("minddy:server-choice:install", (event) => {
    if (!trusted(event)) return { error: installMessage("localStartFailed") };
    const sender = event.sender;
    return deps.install((progress) => {
      if (!sender.isDestroyed()) sender.send("minddy:server-choice:progress", progress);
    });
  });
  ipcMain.on("minddy:server-choice:cancel-install", (event) => {
    if (trusted(event)) deps.cancelInstall();
  });
  ipcMain.on("minddy:server-choice:tool-download", (event, tool: unknown) => {
    // An id from a closed list, never a URL from the page.
    if (!trusted(event) || !LOCAL_PREREQUISITES.includes(tool as LocalPrerequisiteId)) return;
    deps.openExternal(LOCAL_PREREQUISITE_INFO[tool as LocalPrerequisiteId].url);
  });
  ipcMain.on("minddy:server-choice:close", (event) => {
    if (trusted(event)) deps.close();
  });
}

/**
 * `minddy-app://` is the app's own origin for its bundled pages. Declared
 * before `ready`, as Electron requires: standard (relative URLs and a real
 * origin) and secure (a secure context, like HTTPS).
 */
export function registerServerChoiceScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SERVER_CHOICE_SCHEME, privileges: { standard: true, secure: true } },
  ]);
}

/**
 * Serves the server-choice page from `dist/welcome`, built by
 * `scripts/build-desktop.mjs`. A closed list of four files: no path from the
 * URL ever reaches the file system.
 */
export function serveServerChoicePage(directory = path.join(__dirname, "welcome")): void {
  protocol.handle(SERVER_CHOICE_SCHEME, async (request) => {
    const url = new URL(request.url);
    const entry = url.host === SERVER_CHOICE_HOST ? SERVER_CHOICE_FILES[url.pathname] : undefined;
    if (!entry) return new Response("Not found", { status: 404 });
    try {
      return new Response(await readFile(path.join(directory, entry.file)), {
        headers: { "Content-Type": entry.type, "Cache-Control": "no-store" },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
