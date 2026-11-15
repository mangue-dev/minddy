/**
 * The main process's half of the IPC contract (ipc-contract.ts).
 *
 * `registerDesktopIpc` takes one handler per channel, so a channel without a
 * handler does not compile, and applies each channel's sender policy and
 * parser before its handler runs: a handler only ever sees a permitted
 * document and parsed arguments.
 */

import {
  DESKTOP_IPC,
  type DesktopEventChannel,
  type DesktopInvokeArgs,
  type DesktopInvokeChannel,
  type DesktopInvokeResult,
  type DesktopPayloadArgs,
  type DesktopSendArgs,
  type DesktopSendChannel,
  type DesktopSenderPolicy,
  type DesktopStateChannel,
} from "./ipc-contract";
import { mayReceiveLocalSession } from "./local-account";
import { navigationDecision } from "./nav-guard";
import { isServerChoiceDocument } from "./server-choice";

/** What a policy compares the sending document with. */
export interface DesktopSenderContext {
  /** The selected server's origin, minddy Cloud's by default. */
  origin: string;
  /** The origin of the local instance this app installs. */
  localOrigin: string;
  /** The server the person chose, `null` for minddy Cloud. */
  customServerOrigin: string | null;
}

/**
 * Whether the main window's top document at `url` may use a channel; `null`
 * is any other frame or window.
 */
export function desktopSenderAllowed(
  policy: DesktopSenderPolicy,
  url: string | null,
  context: DesktopSenderContext,
): boolean {
  if (url === null) return false;
  switch (policy) {
    case "window":
      return true;
    case "app":
      return navigationDecision(url, context.origin) === "allow";
    case "local":
      return mayReceiveLocalSession(url, context.localOrigin, context.customServerOrigin);
    case "welcome":
      return isServerChoiceDocument(url);
  }
}

/** The fields of Electron's `IpcMainEvent` and `IpcMainInvokeEvent` the policies read. */
export interface DesktopIpcEventLike {
  readonly sender: unknown;
  readonly senderFrame?: { readonly url: string } | null;
}

export interface DesktopIpcMainLike<E> {
  on(channel: string, listener: (event: E, ...args: unknown[]) => void): unknown;
  handle(channel: string, listener: (event: E, ...args: unknown[]) => unknown): unknown;
}

export type DesktopIpcHandlers<E> = {
  [C in DesktopInvokeChannel]: (
    event: E,
    ...args: DesktopInvokeArgs<C>
  ) => DesktopInvokeResult<C> | Promise<DesktopInvokeResult<C>>;
} & {
  [C in DesktopSendChannel]: (event: E, ...args: DesktopSendArgs<C>) => void;
} & {
  /** Answers a new subscriber, and forgets it when it leaves (when the channel says so). */
  [C in DesktopStateChannel]: { ready: (event: E) => void; notReady?: (event: E) => void };
};

export interface DesktopIpcMainOptions<E> {
  ipcMain: DesktopIpcMainLike<E>;
  /** The main window's contents, `null` while there is none. */
  mainContents: () => { readonly mainFrame: unknown } | null;
  context: () => DesktopSenderContext;
}

/** The URL of the sending document when it is the main window's top frame. */
function mainWindowDocument<E extends DesktopIpcEventLike>(
  event: E,
  contents: { readonly mainFrame: unknown } | null,
): string | null {
  const frame = event.senderFrame;
  if (!contents || event.sender !== contents || !frame || frame !== contents.mainFrame) return null;
  return frame.url;
}

export function registerDesktopIpc<E extends DesktopIpcEventLike>(
  options: DesktopIpcMainOptions<E>,
  handlers: DesktopIpcHandlers<E>,
): void {
  const allowed = (policy: DesktopSenderPolicy, event: E) =>
    desktopSenderAllowed(policy, mainWindowDocument(event, options.mainContents()), options.context());

  for (const channel of Object.keys(DESKTOP_IPC) as (keyof typeof DESKTOP_IPC)[]) {
    const entry = DESKTOP_IPC[channel];
    if (entry.kind === "invoke") {
      const handler = handlers[channel as DesktopInvokeChannel] as (event: E, ...args: unknown[]) => unknown;
      options.ipcMain.handle(channel, (event, ...raw) => {
        const args = allowed(entry.policy, event) ? entry.parse(raw) : null;
        return args ? handler(event, ...args) : entry.refused;
      });
    } else if (entry.kind === "send") {
      const handler = handlers[channel as DesktopSendChannel] as (event: E, ...args: unknown[]) => void;
      options.ipcMain.on(channel, (event, ...raw) => {
        const args = allowed(entry.policy, event) ? entry.parse(raw) : null;
        if (args) handler(event, ...args);
      });
    } else if (entry.kind === "state") {
      const handler = handlers[channel as DesktopStateChannel];
      options.ipcMain.on(entry.ready, (event) => {
        if (allowed(entry.policy, event)) handler.ready(event);
      });
      const { notReady } = handler;
      if (entry.notReady && notReady) {
        options.ipcMain.on(entry.notReady, (event) => {
          if (allowed(entry.policy, event)) notReady(event);
        });
      }
    }
  }
}

/** The part of a `WebContents` that receives events. */
export interface DesktopIpcTarget {
  send(channel: string, ...args: unknown[]): void;
}

/** Sends a main-to-renderer channel with the payload the contract declares for it. */
export function sendDesktopEvent<C extends DesktopStateChannel | DesktopEventChannel>(
  target: DesktopIpcTarget,
  channel: C,
  ...payload: DesktopPayloadArgs<C>
): void {
  target.send(channel, ...payload);
}
