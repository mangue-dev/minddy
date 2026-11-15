/**
 * The preload's half of the IPC contract (ipc-contract.ts): every bridge
 * member is one of these three calls, so the preload cannot name a channel
 * the contract does not declare, nor send it the wrong arguments.
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
  type DesktopStateChannel,
} from "./ipc-contract";

/** The part of Electron's `ipcRenderer` the preload uses. */
export interface DesktopIpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

export function desktopIpcRenderer(renderer: DesktopIpcRendererLike) {
  return {
    invoke<C extends DesktopInvokeChannel>(channel: C, ...args: DesktopInvokeArgs<C>): Promise<DesktopInvokeResult<C>> {
      return renderer.invoke(channel, ...args) as Promise<DesktopInvokeResult<C>>;
    },

    send<C extends DesktopSendChannel>(channel: C, ...args: DesktopSendArgs<C>): void {
      renderer.send(channel, ...args);
    },

    /**
     * Listens first, then asks a `state` channel for its replay, so the value
     * cannot arrive between the two. Returns the unsubscriber.
     */
    subscribe<C extends DesktopStateChannel | DesktopEventChannel>(
      channel: C,
      handler: (...payload: DesktopPayloadArgs<C>) => void,
    ): () => void {
      const entry = DESKTOP_IPC[channel];
      const listener = (_event: unknown, ...payload: unknown[]) => {
        if (entry.valid && !entry.valid(payload[0])) return;
        (handler as (...args: unknown[]) => void)(...payload);
      };
      renderer.on(channel, listener);
      if (entry.kind === "state") renderer.send(entry.ready);
      return () => {
        renderer.removeListener(channel, listener);
        if (entry.kind === "state" && entry.notReady) renderer.send(entry.notReady);
      };
    },
  };
}
