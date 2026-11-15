import { readFile } from "node:fs/promises";
import path from "node:path";
import { protocol } from "electron";

import {
  LOCAL_PREREQUISITE_INFO,
  installMessage,
  type InstallMessage,
  type LocalInstallProgress,
  type LocalPrerequisiteResult,
} from "@/lib/desktop/local-installer";
import { sendDesktopEvent, type DesktopIpcHandlers, type DesktopIpcTarget } from "@/lib/desktop/ipc-main";
import {
  SERVER_CHOICE_FILES,
  SERVER_CHOICE_HOST,
  SERVER_CHOICE_SCHEME,
  type DesktopServerChoiceState,
} from "@/lib/desktop/server-choice";

interface ServerChoiceDependencies {
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

type ServerChoiceChannel = Extract<keyof DesktopIpcHandlers<unknown>, `minddy:server-choice:${string}`>;

/**
 * The main-process side of the server-choice page (MIN-781). Its channels'
 * `welcome` policy (ipc-contract.ts) answers only the app's own
 * `minddy-app://welcome/` in the main window's top frame: any server's page,
 * minddy Cloud's included, gets nothing.
 */
export function serverChoiceHandlers<E extends { sender: DesktopIpcTarget & { isDestroyed(): boolean } }>(
  deps: ServerChoiceDependencies,
): Pick<DesktopIpcHandlers<E>, ServerChoiceChannel> {
  return {
    "minddy:server-choice:state": () => deps.state(),
    "minddy:server-choice:cloud": () => deps.useCloud(),
    "minddy:server-choice:connect": (_event, origin) => {
      if (origin === null) return { error: installMessage("serverInvalid") };
      deps.connect(origin);
      return {};
    },
    // Repeated clicks share one folder dialog and one startup
    // (`createLocalStartupSelection` behind `useExistingInstallation`).
    "minddy:server-choice:existing": () => deps.useExistingInstallation(),
    "minddy:server-choice:prerequisites": () => deps.prerequisites(),
    "minddy:server-choice:choose-folder": () => deps.chooseInstallFolder(),
    "minddy:server-choice:install": ({ sender }) =>
      deps.install((progress) => {
        if (!sender.isDestroyed()) sendDesktopEvent(sender, "minddy:server-choice:progress", progress);
      }),
    "minddy:server-choice:cancel-install": () => deps.cancelInstall(),
    "minddy:server-choice:tool-download": (_event, tool) => deps.openExternal(LOCAL_PREREQUISITE_INFO[tool].url),
    "minddy:server-choice:close": () => deps.close(),
  };
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
