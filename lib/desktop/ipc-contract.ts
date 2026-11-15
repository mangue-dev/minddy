/**
 * Every message between the desktop shell's preload and its main process.
 *
 * The page in the window is remote code, and the preload hands it the
 * `DesktopBridge` (bridge.ts). Each member reaches the main process through
 * one channel declared here, with:
 *
 * - its kind: `invoke` answers, `send` does not, `state` is a main-process
 *   value replayed to each new subscriber, `event` is a plain notification;
 * - its sender policy (`DesktopSenderPolicy`), checked by the main process
 *   before anything else (ipc-main.ts);
 * - its parser, which reduces what the page sent to the handler's arguments
 *   or rejects it, and for `invoke` the answer a rejected call gets.
 *
 * No argument names a file: a path enters the shell only through a native
 * dialog, never from the page.
 *
 * The preload bundles this module, so it stays free of Node APIs.
 */

import type { DesktopAuthLink } from "./auth-link";
import type { DesktopNativePushRegistration } from "./bridge";
import type { LinuxBackgroundNotificationState } from "./linux-background";
import type { LocalAccountSession } from "./local-account";
import {
  LOCAL_PREREQUISITES,
  installMessage,
  type InstallMessage,
  type LocalInstallProgress,
  type LocalPrerequisiteId,
  type LocalPrerequisiteResult,
} from "./local-installer";
import {
  parseDesktopLocalNotification,
  parseDesktopLocalNotificationId,
  type DesktopLocalNotificationPayload,
} from "./local-notification";
import type { DesktopServerChoiceState } from "./server-choice";
import { normalizeDesktopServerOrigin } from "./server-origin";
import type { DesktopUpdateStatus } from "./update-status";
import { isDesktopWindowMaterialState, type DesktopWindowMaterialState } from "./window-material";
import { isAgentAppLink } from "./agent-app-links";

/**
 * Which document may use a channel. Every policy first requires the main
 * window's top frame; the bridge exists in no other frame or window.
 *
 * - `window`: any document there, including the bundled
 *   `minddy-app://welcome/` page and the shell's own `data:` pages;
 * - `app`: a page of the selected server;
 * - `local`: a page of the local instance this app installed, while it is the
 *   selected server;
 * - `welcome`: the bundled self-hosting page.
 */
export type DesktopSenderPolicy = "window" | "app" | "local" | "welcome";

type ServerChoiceAnswer = { error?: InstallMessage };

/** Renderer to main, answered: arguments as the handler receives them, and the answer. */
interface InvokeChannels {
  "minddy:push:register": { args: [options: { activate: boolean }]; result: DesktopNativePushRegistration | null };
  "minddy:push:unregister": { args: []; result: void };
  "minddy:local-account:session": { args: []; result: LocalAccountSession | null };
  "minddy:local-runtime:restart": { args: []; result: boolean };
  "minddy:update:check": { args: []; result: void };
  "minddy:linux-background:get": { args: []; result: LinuxBackgroundNotificationState | null };
  "minddy:linux-background:set": { args: [enabled: boolean]; result: LinuxBackgroundNotificationState | null };
  "minddy:window-material:set": { args: [enabled: boolean]; result: DesktopWindowMaterialState };
  "minddy:storage:flush": { args: []; result: void };
  "minddy:server-choice:state": { args: []; result: DesktopServerChoiceState | null };
  "minddy:server-choice:cloud": { args: []; result: void };
  /** `null` when the address is not a valid server origin. */
  "minddy:server-choice:connect": { args: [origin: string | null]; result: ServerChoiceAnswer };
  "minddy:server-choice:existing": { args: []; result: ServerChoiceAnswer };
  "minddy:server-choice:prerequisites": { args: []; result: LocalPrerequisiteResult[] };
  "minddy:server-choice:choose-folder": { args: []; result: { folder?: string; error?: InstallMessage } };
  "minddy:server-choice:install": { args: []; result: ServerChoiceAnswer };
}

/** Renderer to main, unanswered. */
interface SendChannels {
  "minddy:window-chrome": [theme: "light" | "dark", followsSystem?: boolean];
  "minddy:server-picker:open": [];
  "minddy:open-external": [url: string];
  "minddy:open-agent-app": [link: string];
  "minddy:windows-store:open": [];
  "minddy:set-badge": [count: number];
  "minddy:notification:show": [payload: DesktopLocalNotificationPayload];
  "minddy:notification:dismiss": [id: string];
  "minddy:push:open-settings": [];
  "minddy:focus": [];
  "minddy:install-update": [];
  "minddy:server-choice:cancel-install": [];
  "minddy:server-choice:tool-download": [tool: LocalPrerequisiteId];
  "minddy:server-choice:close": [];
}

/**
 * Main to renderer, replayed: a subscriber announces itself on the entry's
 * `ready` channel and the main process answers that subscriber alone with the
 * current value, which existed before the page did.
 */
interface StateChannels {
  "minddy:window-material-state": DesktopWindowMaterialState;
  "minddy:windows-store-update-status": boolean;
  "minddy:auth-link": DesktopAuthLink;
  "minddy:window-buttons-state": boolean;
  "minddy:update-status": DesktopUpdateStatus;
  "minddy:linux-background:changed": LinuxBackgroundNotificationState;
}

/** Main to renderer, not replayed. */
interface EventChannels {
  "minddy:notification:wake": void;
  "minddy:server-choice:progress": LocalInstallProgress;
}

export type DesktopInvokeChannel = keyof InvokeChannels;
export type DesktopSendChannel = keyof SendChannels;
export type DesktopStateChannel = keyof StateChannels;
export type DesktopEventChannel = keyof EventChannels;

export type DesktopInvokeArgs<C extends DesktopInvokeChannel> = InvokeChannels[C]["args"];
export type DesktopInvokeResult<C extends DesktopInvokeChannel> = InvokeChannels[C]["result"];
export type DesktopSendArgs<C extends DesktopSendChannel> = SendChannels[C];
export type DesktopPayload<C extends DesktopStateChannel | DesktopEventChannel> =
  (StateChannels & EventChannels)[C];
/** The payload as a rest tuple, empty for a channel that carries none. */
export type DesktopPayloadArgs<C extends DesktopStateChannel | DesktopEventChannel> =
  [DesktopPayload<C>] extends [void] ? [] : [payload: DesktopPayload<C>];

/** Reduces the arguments the page sent; `null` rejects the call. */
type Parser<A extends unknown[]> = (args: readonly unknown[]) => A | null;

export interface DesktopInvokeEntry<A extends unknown[], R> {
  readonly kind: "invoke";
  readonly policy: DesktopSenderPolicy;
  readonly parse: Parser<A>;
  /** The answer to a call refused by the policy or the parser. */
  readonly refused: R;
}

export interface DesktopSendEntry<A extends unknown[]> {
  readonly kind: "send";
  readonly policy: DesktopSenderPolicy;
  readonly parse: Parser<A>;
}

export interface DesktopStateEntry<P> {
  readonly kind: "state";
  /** Who may subscribe, that is receive the replayed value. */
  readonly policy: DesktopSenderPolicy;
  readonly ready: string;
  /** Sent on unsubscribe, for a value the main process holds until someone takes it. */
  readonly notReady?: string;
  /** Drops a malformed payload before it reaches the page. */
  readonly valid?: (payload: unknown) => payload is P;
}

export interface DesktopEventEntry<P> {
  readonly kind: "event";
  readonly valid?: (payload: unknown) => payload is P;
}

type Contract = { [C in DesktopInvokeChannel]: DesktopInvokeEntry<DesktopInvokeArgs<C>, DesktopInvokeResult<C>> } & {
  [C in DesktopSendChannel]: DesktopSendEntry<DesktopSendArgs<C>>;
} & { [C in DesktopStateChannel]: DesktopStateEntry<StateChannels[C]> } & {
  [C in DesktopEventChannel]: DesktopEventEntry<EventChannels[C]>;
};

const noArgs = (): [] => [];
const flag = ([value]: readonly unknown[]): [boolean] | null => (typeof value === "boolean" ? [value] : null);
const SERVER_CHOICE_REFUSED: ServerChoiceAnswer = { error: installMessage("localStartFailed") };

function invoke<A extends unknown[], R>(
  policy: DesktopSenderPolicy,
  refused: R,
  parse: Parser<A>,
): DesktopInvokeEntry<A, R> {
  return { kind: "invoke", policy, parse, refused };
}

function send<A extends unknown[]>(policy: DesktopSenderPolicy, parse: Parser<A>): DesktopSendEntry<A> {
  return { kind: "send", policy, parse };
}

export const DESKTOP_IPC: Contract = {
  "minddy:push:register": invoke("app", null, ([options]) => [
    { activate: typeof options === "object" && options !== null && (options as { activate?: unknown }).activate === true },
  ]),
  "minddy:push:unregister": invoke("app", undefined, noArgs),
  "minddy:local-account:session": invoke("local", null, noArgs),
  "minddy:local-runtime:restart": invoke("local", false, noArgs),
  "minddy:update:check": invoke("app", undefined, noArgs),
  "minddy:linux-background:get": invoke("app", null, noArgs),
  "minddy:linux-background:set": invoke("app", null, flag),
  "minddy:window-material:set": invoke(
    "app",
    { supported: false, enabled: false, reducedTransparency: false, kind: "none" },
    flag,
  ),
  "minddy:storage:flush": invoke("window", undefined, noArgs),
  "minddy:server-choice:state": invoke("welcome", null, noArgs),
  "minddy:server-choice:cloud": invoke("welcome", undefined, noArgs),
  "minddy:server-choice:connect": invoke("welcome", SERVER_CHOICE_REFUSED, ([raw]) => {
    try {
      return [normalizeDesktopServerOrigin(raw)];
    } catch {
      return [null];
    }
  }),
  "minddy:server-choice:existing": invoke("welcome", SERVER_CHOICE_REFUSED, noArgs),
  "minddy:server-choice:prerequisites": invoke("welcome", [], noArgs),
  "minddy:server-choice:choose-folder": invoke("welcome", SERVER_CHOICE_REFUSED, noArgs),
  "minddy:server-choice:install": invoke("welcome", SERVER_CHOICE_REFUSED, noArgs),

  "minddy:window-chrome": send("window", ([theme, followsSystem]) =>
    theme === "light" || theme === "dark"
      ? [theme, typeof followsSystem === "boolean" ? followsSystem : undefined]
      : null,
  ),
  "minddy:server-picker:open": send("window", noArgs),
  "minddy:open-external": send("window", ([url]) => (typeof url === "string" ? [url] : null)),
  "minddy:open-agent-app": send("app", ([link]) => (isAgentAppLink(link) ? [link] : null)),
  "minddy:windows-store:open": send("app", noArgs),
  // Anything but a finite count clears the badge.
  "minddy:set-badge": send("app", ([count]) => [
    typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
  ]),
  "minddy:notification:show": send("app", ([input]) => {
    const payload = parseDesktopLocalNotification(input);
    return payload ? [payload] : null;
  }),
  "minddy:notification:dismiss": send("app", ([input]) => {
    const id = parseDesktopLocalNotificationId(input);
    return id ? [id] : null;
  }),
  "minddy:push:open-settings": send("app", noArgs),
  "minddy:focus": send("window", noArgs),
  "minddy:install-update": send("app", noArgs),
  "minddy:server-choice:cancel-install": send("welcome", noArgs),
  // An id from a closed list, never a URL from the page.
  "minddy:server-choice:tool-download": send("welcome", ([tool]) =>
    LOCAL_PREREQUISITES.includes(tool as LocalPrerequisiteId) ? [tool as LocalPrerequisiteId] : null,
  ),
  "minddy:server-choice:close": send("welcome", noArgs),

  "minddy:window-material-state": {
    kind: "state",
    policy: "window",
    ready: "minddy:window-material-ready",
    valid: isDesktopWindowMaterialState,
  },
  "minddy:windows-store-update-status": {
    kind: "state",
    policy: "window",
    ready: "minddy:windows-store-update-status-ready",
  },
  // A sign-in link can launch the app, long before the page subscribes; the
  // main process keeps it until a page of the selected server takes it.
  "minddy:auth-link": {
    kind: "state",
    policy: "app",
    ready: "minddy:auth-link-ready",
    notReady: "minddy:auth-link-not-ready",
  },
  "minddy:window-buttons-state": { kind: "state", policy: "window", ready: "minddy:window-buttons-ready" },
  "minddy:update-status": { kind: "state", policy: "window", ready: "minddy:update-status-ready" },
  "minddy:linux-background:changed": {
    kind: "state",
    policy: "app",
    ready: "minddy:linux-background:ready",
  },

  "minddy:notification:wake": { kind: "event" },
  "minddy:server-choice:progress": { kind: "event" },
};

export type DesktopIpcChannel = keyof Contract;
