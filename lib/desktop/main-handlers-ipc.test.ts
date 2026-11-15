import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { navigationHandlers } from "../../desktop/src/navigation-handlers";
import { localHandlers } from "../../desktop/src/local-handlers";
import { updateHandlers } from "../../desktop/src/update-handlers";
import { notificationHandlers, pushHandlers, type NativeBanner } from "../../desktop/src/notification-handlers";
import { windowHandlers } from "../../desktop/src/window-handlers";
import { serverChoiceHandlers } from "../../desktop/src/server-choice";
import { buildAgentDeepLink } from "@/lib/prompt-delivery";
import { createDesktopAuthLinkDelivery } from "./auth-link-delivery";
import { DESKTOP_IPC, type DesktopIpcChannel } from "./ipc-contract";
import { registerDesktopIpc, type DesktopIpcHandlers, type DesktopSenderContext } from "./ipc-main";
import { WINDOWS_STORE_DEEP_LINK } from "./install-prompt";
import { DesktopLocalNotificationRegistry } from "./local-notification";
import {
  UNSUPPORTED_NOTIFICATION_CAPABILITIES,
  type DesktopNotificationCapabilities,
} from "./notification-capabilities";
import type { DesktopWindowMaterialState } from "./window-material";

vi.mock("../../desktop/node_modules/electron", () => ({
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
}));

interface FakeSender {
  id: number;
  send: Mock<(channel: string, ...args: unknown[]) => void>;
  isDestroyed(): boolean;
  session: { flushStorageData: Mock<() => void> };
}
interface FakeEvent {
  sender: FakeSender;
  senderFrame: { url: string } | null;
}

const CLOUD = "https://www.minddy.app";
const LOCAL = "http://localhost:6463";
const MATERIAL: DesktopWindowMaterialState = { supported: true, enabled: true, reducedTransparency: false, kind: "vibrancy" };

function fakeSender(id: number): FakeSender {
  return { id, send: vi.fn(), isDestroyed: () => false, session: { flushStorageData: vi.fn() } };
}

let capabilities: DesktopNotificationCapabilities;
let context: DesktopSenderContext;
const mainFrame = { url: `${CLOUD}/home` };
const contents = { ...fakeSender(1), mainFrame };
/** The main window's top document, the only one any policy admits. */
const page: FakeEvent = { sender: contents, senderFrame: mainFrame };

function banner(): NativeBanner & { listeners: Map<string, () => void>; show: Mock; close: Mock } {
  const listeners = new Map<string, () => void>();
  return { listeners, on: (event, listener) => listeners.set(event, listener), show: vi.fn(), close: vi.fn() };
}

function setup() {
  const sentLinks: unknown[] = [];
  const authLinks = createDesktopAuthLinkDelivery({ currentRenderer: () => contents.id, send: (link) => sentLinks.push(link) });
  const banners: ReturnType<typeof banner>[] = [];
  const shell = { origin: CLOUD, materialEnabled: true, fullScreen: false, mainWindow: true };
  const window = { isFullScreen: () => shell.fullScreen, setTitleBarOverlay: vi.fn() };
  const deps = {
    navigation: {
      origin: () => shell.origin,
      openExternal: vi.fn(),
      authLinks,
      showServerChoice: vi.fn(),
    },
    local: {
      runtimeRoot: vi.fn((): string | null => "/clone"),
      ownsRuntime: vi.fn(() => true),
      accountSession: vi.fn(async () => ({ access_token: "a", refresh_token: "r" }) as never),
      stopRuntime: vi.fn(),
      startRuntime: vi.fn(async () => {}),
      reloadWindow: vi.fn(),
      discoverModels: vi.fn(async () => ({ ok: true, models: ["llama"] }) as never),
    },
    update: {
      checkForUpdates: vi.fn(),
      replayUpdateStatus: vi.fn(),
      requestInstall: vi.fn(),
      windowsStore: false,
      windowsStoreUpdateAvailable: () => true,
      openExternal: vi.fn(),
    },
    notification: {
      capabilities: () => capabilities,
      bannersSupported: vi.fn(() => true),
      createBanner: vi.fn(() => {
        const created = banner();
        banners.push(created);
        return created;
      }),
      banners: new DesktopLocalNotificationRegistry(),
      origin: () => shell.origin,
      revealTarget: vi.fn(),
      setBannersAvailable: vi.fn(),
      setDockBadge: vi.fn(),
      setWindowsBadge: vi.fn(),
      linuxBackgroundState: vi.fn(() =>
        capabilities.backgroundSession === "linux"
          ? { enabled: true, autostartInstalled: true, nativeBannersAvailable: true }
          : null,
      ),
      setLinuxBackground: vi.fn(),
    },
    push: {
      capabilities: () => capabilities,
      allowPush: vi.fn(async () => {}),
      pushAllowed: vi.fn(async () => true),
      disablePush: vi.fn(async (unregister: () => unknown) => void (await unregister())),
      installationId: vi.fn(async () => "installation-1"),
      registerApns: vi.fn(async () => "token"),
      unregisterApns: vi.fn(),
      requestWnsChannel: vi.fn(async (): Promise<string | null> => "https://wns.example/channel"),
      unregisterWns: vi.fn(async () => {}),
      openExternal: vi.fn(),
    },
    window: {
      platform: "win32" as NodeJS.Platform,
      mainWindow: () => (shell.mainWindow ? window : null),
      integratedFrame: () => true,
      nativeTheme: { themeSource: "system" as "system" | "light" | "dark" },
      currentMaterial: () => MATERIAL,
      materialEnabled: () => shell.materialEnabled,
      setMaterialEnabled: vi.fn((enabled: boolean) => void (shell.materialEnabled = enabled)),
      senderFullScreen: vi.fn(() => false),
      windowButtonsVisible: () => true,
      focus: vi.fn(),
    },
  };
  const modules = {
    serverChoice: serverChoiceHandlers<FakeEvent>({
      state: vi.fn(() => null as never),
      useCloud: vi.fn(),
      connect: vi.fn(),
      useExistingInstallation: vi.fn(async () => ({})),
      prerequisites: vi.fn(async () => []),
      chooseInstallFolder: vi.fn(async () => ({})),
      install: vi.fn(async () => ({})),
      cancelInstall: vi.fn(),
      openExternal: vi.fn(),
      close: vi.fn(),
    }),
    navigation: navigationHandlers<FakeEvent>(deps.navigation),
    local: localHandlers<FakeEvent>(deps.local),
    update: updateHandlers<FakeEvent>(deps.update),
    notification: notificationHandlers<FakeEvent>(deps.notification),
    push: pushHandlers<FakeEvent>(deps.push),
    window: windowHandlers<FakeEvent>(deps.window),
  };

  const listeners = new Map<string, (event: FakeEvent, ...args: unknown[]) => unknown>();
  const register = (name: string, listener: (event: FakeEvent, ...args: unknown[]) => unknown) => {
    listeners.set(name, listener);
  };
  registerDesktopIpc<FakeEvent>(
    { ipcMain: { on: register, handle: register }, mainContents: () => contents, context: () => context },
    Object.assign({}, ...Object.values(modules)) as DesktopIpcHandlers<FakeEvent>,
  );
  /** Calls a channel as the page would; a state channel by its subscribe message. */
  const call = (channel: DesktopIpcChannel, event: FakeEvent = page, ...args: unknown[]) => {
    const entry = DESKTOP_IPC[channel];
    return listeners.get(entry.kind === "state" ? entry.ready : channel)!(event, ...args);
  };
  return { deps, modules, listeners, call, shell, window, banners, authLinks, sentLinks };
}

/** Every fake dependency that records calls, across all modules. */
function recorded(deps: ReturnType<typeof setup>["deps"]): Mock[] {
  return Object.values(deps)
    .flatMap((group) => Object.values(group))
    .filter((value): value is Mock => vi.isMockFunction(value));
}

beforeEach(() => {
  capabilities = { ...UNSUPPORTED_NOTIFICATION_CAPABILITIES };
  context = { origin: CLOUD, localOrigin: LOCAL, customServerOrigin: null };
  mainFrame.url = `${CLOUD}/home`;
  contents.send.mockClear();
  contents.session.flushStorageData.mockClear();
});

describe("the main process's handler modules", () => {
  it("answer every channel of the contract exactly once", () => {
    const { modules } = setup();
    const owned = Object.values(modules).flatMap((map) => Object.keys(map));
    const answered = Object.entries(DESKTOP_IPC)
      .filter(([, entry]) => entry.kind !== "event")
      .map(([name]) => name);
    expect([...owned].sort()).toEqual([...answered].sort());
  });

  it("run nothing for a page outside the main window's top frame or the channel's policy", async () => {
    const { deps, call } = setup();
    const strangers: FakeEvent[] = [
      { sender: fakeSender(2), senderFrame: mainFrame },
      { sender: contents, senderFrame: { url: `${CLOUD}/home` } },
      { sender: contents, senderFrame: null },
    ];
    const channels = Object.keys(DESKTOP_IPC).filter(
      (name) => !name.startsWith("minddy:server-choice:") && DESKTOP_IPC[name as DesktopIpcChannel].kind !== "event",
    ) as DesktopIpcChannel[];
    for (const event of strangers) {
      for (const channel of channels) await call(channel, event, true);
    }
    // The bundled self-hosting page has the bridge, but only `window` channels.
    mainFrame.url = "minddy-app://welcome/";
    for (const channel of channels) {
      const entry = DESKTOP_IPC[channel];
      if (entry.kind !== "event" && entry.policy !== "window") await call(channel, page, true);
    }
    for (const fn of recorded(deps)) expect(fn).not.toHaveBeenCalled();
    expect(contents.send).not.toHaveBeenCalled();
  });

  it("answer a refused call with the contract's refusal", async () => {
    const { call } = setup();
    mainFrame.url = "https://evil.example.com/";
    expect(await call("minddy:local-runtime:restart")).toBe(false);
    expect(await call("minddy:push:register", page, { activate: true })).toBeNull();
    expect(await call("minddy:window-material:set", page, true)).toMatchObject({ supported: false, kind: "none" });
  });
});

describe("navigation", () => {
  it("lets out only what the navigation guard does, from any document in the window", () => {
    const { deps, call } = setup();
    mainFrame.url = "minddy-app://welcome/";
    call("minddy:open-external", page, "file:///etc/passwd");
    call("minddy:open-external", page, "https://github.com/mangue-dev/minddy");
    expect(deps.navigation.openExternal.mock.calls).toEqual([["https://github.com/mangue-dev/minddy"]]);
  });

  it("opens an agent app's new-conversation link and nothing else of that app", () => {
    const { deps, call } = setup();
    const link = buildAgentDeepLink("claude", "Implement MIN-42.")!;
    call("minddy:open-agent-app", page, "claude://claude.ai/settings");
    call("minddy:open-agent-app", page, link);
    expect(deps.navigation.openExternal.mock.calls).toEqual([[link]]);
  });

  it("holds a sign-in link until the current document subscribes, then sends it once (MIN-310)", () => {
    const { authLinks, call, sentLinks } = setup();
    const link = { kind: "code", code: "c", next: "/home" } as const;
    authLinks.receive(link);
    expect(sentLinks).toEqual([]);
    // Another window's document cannot take it.
    call("minddy:auth-link", { sender: fakeSender(2), senderFrame: mainFrame });
    expect(sentLinks).toEqual([]);
    call("minddy:auth-link", page);
    expect(sentLinks).toEqual([link]);
  });

  it("keeps the next link once the document unsubscribes", () => {
    const { authLinks, listeners, call, sentLinks } = setup();
    call("minddy:auth-link", page);
    listeners.get("minddy:auth-link-not-ready")!(page);
    authLinks.receive({ kind: "error", error: "access_denied", reason: "x" });
    expect(sentLinks).toEqual([]);
    call("minddy:auth-link", page);
    expect(sentLinks).toHaveLength(1);
  });
});

describe("the local instance", () => {
  function selectLocal() {
    context = { origin: LOCAL, localOrigin: LOCAL, customServerOrigin: LOCAL };
    mainFrame.url = `${LOCAL}/admin`;
  }

  it("restarts only for the local instance's page while it is the selected server", async () => {
    const { deps, call } = setup();
    mainFrame.url = `${LOCAL}/admin`;
    expect(await call("minddy:local-runtime:restart")).toBe(false);
    selectLocal();
    expect(await call("minddy:local-runtime:restart")).toBe(true);
    expect(deps.local.stopRuntime).toHaveBeenCalledTimes(1);
    expect(deps.local.startRuntime).toHaveBeenCalledWith("/clone");
    expect(deps.local.reloadWindow).toHaveBeenCalledTimes(1);
  });

  it("neither restarts nor signs in an instance this app did not start", async () => {
    const { deps, call } = setup();
    selectLocal();
    deps.local.ownsRuntime.mockReturnValue(false);
    expect(await call("minddy:local-runtime:restart")).toBe(false);
    expect(await call("minddy:local-account:session")).toBeNull();
    deps.local.runtimeRoot.mockReturnValue(null);
    expect(await call("minddy:local-account:session")).toBeNull();
    expect(deps.local.stopRuntime).not.toHaveBeenCalled();
    expect(deps.local.accountSession).not.toHaveBeenCalled();
  });

  it("returns the managed account's session for the instance it started", async () => {
    const { deps, call } = setup();
    selectLocal();
    expect(await call("minddy:local-account:session")).toEqual({ access_token: "a", refresh_token: "r" });
    expect(deps.local.accountSession).toHaveBeenCalledWith("/clone");
  });

  it("passes parsed discovery input to model discovery and refuses the rest", async () => {
    const { deps, call } = setup();
    expect(await call("minddy:local-models:discover", page, { provider: "openai", baseUrl: "http://localhost" })).toEqual({
      ok: false,
      reason: "invalid_endpoint",
    });
    expect(deps.local.discoverModels).not.toHaveBeenCalled();
    expect(await call("minddy:local-models:discover", page, { provider: "ollama", baseUrl: " http://localhost:11434 " }))
      .toEqual({ ok: true, models: ["llama"] });
    expect(deps.local.discoverModels).toHaveBeenCalledWith({ provider: "ollama", baseUrl: "http://localhost:11434" });
  });
});

describe("updates", () => {
  it("replays the update status and the Store's to the subscribing document only", () => {
    const { deps, call } = setup();
    call("minddy:update-status");
    expect(deps.update.replayUpdateStatus).toHaveBeenCalledWith(contents);
    call("minddy:windows-store-update-status");
    expect(contents.send).toHaveBeenCalledWith("minddy:windows-store-update-status", true);
  });

  it("opens the Store page only in the Store build", () => {
    const { deps, call } = setup();
    call("minddy:windows-store:open");
    expect(deps.update.openExternal).not.toHaveBeenCalled();
    updateHandlers<FakeEvent>({ ...deps.update, windowsStore: true })["minddy:windows-store:open"](page);
    expect(deps.update.openExternal).toHaveBeenCalledWith(WINDOWS_STORE_DEEP_LINK);
  });

  it("checks and installs on the page's request", () => {
    const { deps, call } = setup();
    call("minddy:update:check");
    call("minddy:install-update");
    expect(deps.update.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(deps.update.requestInstall).toHaveBeenCalledTimes(1);
  });
});

describe("notifications", () => {
  it("sets the badge the platform has, with a whole non-negative count", () => {
    const { deps, call } = setup();
    call("minddy:set-badge", page, 3);
    expect(deps.notification.setDockBadge).not.toHaveBeenCalled();
    capabilities = { ...capabilities, badge: "dock" };
    call("minddy:set-badge", page, 4.9);
    call("minddy:set-badge", page, -3);
    call("minddy:set-badge", page, "12");
    expect(deps.notification.setDockBadge.mock.calls).toEqual([["4"], [""], [""]]);
    capabilities = { ...capabilities, badge: "windows" };
    call("minddy:set-badge", page, Number.POSITIVE_INFINITY);
    expect(deps.notification.setWindowsBadge).toHaveBeenCalledWith(0);
  });

  const payload = { id: "n1", title: "MIN-42", body: "Assigned to you", target: "/issues?issue=MIN-42" };

  it("shows a banner only where the system supports banners", () => {
    const { deps, call, banners } = setup();
    deps.notification.bannersSupported.mockReturnValue(false);
    call("minddy:notification:show", page, payload);
    expect(deps.notification.createBanner).not.toHaveBeenCalled();
    deps.notification.bannersSupported.mockReturnValue(true);
    call("minddy:notification:show", page, payload);
    call("minddy:notification:show", page, payload);
    call("minddy:notification:show", page, { id: "n2" });
    expect(banners).toHaveLength(2);
    expect(banners[0].show).toHaveBeenCalledTimes(1);
    // The same id again is a duplicate: created, never shown.
    expect(banners[1].show).not.toHaveBeenCalled();
  });

  it("opens the banner's route on click, unless the server changed since", () => {
    const { deps, call, banners, shell } = setup();
    call("minddy:notification:show", page, payload);
    banners[0].listeners.get("click")!();
    expect(deps.notification.revealTarget).toHaveBeenLastCalledWith(payload.target);

    call("minddy:notification:show", page, { ...payload, id: "n2" });
    shell.origin = "https://tickets.example.com";
    banners[1].listeners.get("click")!();
    expect(deps.notification.revealTarget).toHaveBeenLastCalledWith(null);
  });

  it("reports whether banners reach the screen", () => {
    const { deps, call, banners } = setup();
    call("minddy:notification:show", page, payload);
    banners[0].listeners.get("show")!();
    banners[0].listeners.get("failed")!();
    expect(deps.notification.setBannersAvailable.mock.calls).toEqual([[true], [false]]);
  });

  it("dismisses a banner by id", () => {
    const { call, banners } = setup();
    call("minddy:notification:show", page, payload);
    call("minddy:notification:dismiss", page, "n1");
    expect(banners[0].close).toHaveBeenCalledTimes(1);
  });

  it("changes the Linux background session only where there is one", () => {
    const { deps, call } = setup();
    expect(call("minddy:linux-background:set", page, true)).toBeNull();
    call("minddy:linux-background:changed");
    expect(deps.notification.setLinuxBackground).not.toHaveBeenCalled();
    expect(contents.send).not.toHaveBeenCalled();

    capabilities = { ...capabilities, backgroundSession: "linux" };
    expect(call("minddy:linux-background:set", page, "yes")).toBeNull();
    expect(call("minddy:linux-background:set", page, false)).toMatchObject({ enabled: true });
    expect(deps.notification.setLinuxBackground).toHaveBeenCalledWith(false);
    call("minddy:linux-background:changed");
    expect(contents.send).toHaveBeenCalledWith("minddy:linux-background:changed", {
      enabled: true,
      autostartInstalled: true,
      nativeBannersAvailable: true,
    });
  });
});

describe("native push", () => {
  it("registers nothing without a transport or the person's opt-in", async () => {
    const { deps, call } = setup();
    expect(await call("minddy:push:register", page, { activate: true })).toBeNull();
    capabilities = { ...capabilities, backgroundTransport: "apns" };
    deps.push.pushAllowed.mockResolvedValue(false);
    expect(await call("minddy:push:register", page, { activate: "yes" })).toBeNull();
    expect(deps.push.allowPush).not.toHaveBeenCalled();
    expect(deps.push.registerApns).not.toHaveBeenCalled();
  });

  it("shares one APNs registration between mounts and retries after a failure", async () => {
    const { deps, call } = setup();
    capabilities = { ...capabilities, backgroundTransport: "apns" };
    const [first, second] = await Promise.all([
      call("minddy:push:register", page, { activate: true }),
      call("minddy:push:register", page, {}),
    ]);
    expect(first).toEqual({ transport: "apns", endpoint: "apns:token", installationId: "installation-1" });
    expect(second).toEqual(first);
    expect(deps.push.allowPush).toHaveBeenCalledTimes(1);
    expect(deps.push.registerApns).toHaveBeenCalledTimes(1);

    await call("minddy:push:unregister");
    expect(deps.push.disablePush).toHaveBeenCalledWith(deps.push.unregisterApns);
    expect(deps.push.unregisterApns).toHaveBeenCalledTimes(1);
    deps.push.registerApns.mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await call("minddy:push:register", page, {})).toBeNull();
    expect(await call("minddy:push:register", page, {})).toMatchObject({ endpoint: "apns:token" });
    expect(deps.push.registerApns).toHaveBeenCalledTimes(3);
  });

  it("asks WNS again after a channel request that returned none", async () => {
    const { deps, call } = setup();
    capabilities = { ...capabilities, backgroundTransport: "wns" };
    deps.push.requestWnsChannel.mockResolvedValueOnce(null);
    expect(await call("minddy:push:register", page, {})).toBeNull();
    expect(await call("minddy:push:register", page, {})).toEqual({
      transport: "wns",
      endpoint: "https://wns.example/channel",
      installationId: "installation-1",
    });
    await call("minddy:push:unregister");
    expect(deps.push.unregisterWns).toHaveBeenCalledTimes(1);
  });

  it("opens the system's notification settings, never a page's URL", () => {
    const { deps, call } = setup();
    call("minddy:push:open-settings", page, "https://evil.example.com");
    capabilities = { ...capabilities, settings: "windows" };
    call("minddy:push:open-settings");
    capabilities = { ...capabilities, settings: "macos" };
    call("minddy:push:open-settings");
    expect(deps.push.openExternal.mock.calls).toEqual([
      ["ms-settings:notifications"],
      [expect.stringMatching(/^x-apple\.systempreferences:com\.apple\.Notifications-Settings/)],
    ]);
  });
});

describe("the window", () => {
  it("follows the page's theme, and tints the caption controls of an integrated frame", () => {
    const { deps, call, window, shell } = setup();
    call("minddy:window-chrome", page, "dark", false);
    expect(deps.window.nativeTheme.themeSource).toBe("dark");
    expect(window.setTitleBarOverlay).toHaveBeenCalledWith(expect.objectContaining({ symbolColor: "#eeeeee" }));
    // An older page sends no second argument and leaves the app's theme alone.
    call("minddy:window-chrome", page, "light");
    expect(deps.window.nativeTheme.themeSource).toBe("dark");
    call("minddy:window-chrome", page, "sepia", true);
    expect(deps.window.nativeTheme.themeSource).toBe("dark");

    shell.mainWindow = false;
    call("minddy:window-chrome", page, "light", true);
    expect(deps.window.nativeTheme.themeSource).toBe("dark");
    expect(window.setTitleBarOverlay).toHaveBeenCalledTimes(2);
  });

  it("leaves macOS caption controls to the system", () => {
    const { deps, window } = setup();
    windowHandlers<FakeEvent>({ ...deps.window, platform: "darwin" })["minddy:window-chrome"](page, "dark", false);
    expect(deps.window.nativeTheme.themeSource).toBe("dark");
    expect(window.setTitleBarOverlay).not.toHaveBeenCalled();
  });

  it("saves the material preference only when it changes, and answers with the window's material", () => {
    const { deps, call, shell } = setup();
    expect(call("minddy:window-material:set", page, true)).toEqual(MATERIAL);
    expect(deps.window.setMaterialEnabled).not.toHaveBeenCalled();
    shell.fullScreen = true;
    expect(call("minddy:window-material:set", page, false)).toEqual({ ...MATERIAL, kind: "none" });
    expect(deps.window.setMaterialEnabled).toHaveBeenCalledWith(false);
  });

  it("replays the material and the buttons to the subscribing document's window", () => {
    const { deps, call } = setup();
    deps.window.senderFullScreen.mockReturnValue(true);
    call("minddy:window-material-state");
    expect(deps.window.senderFullScreen).toHaveBeenCalledWith(contents);
    expect(contents.send).toHaveBeenCalledWith("minddy:window-material-state", { ...MATERIAL, kind: "none" });
    call("minddy:window-buttons-state");
    expect(contents.send).toHaveBeenCalledWith("minddy:window-buttons-state", true);
  });

  it("focuses the window and flushes the sender's storage for any document in it", () => {
    const { deps, call } = setup();
    mainFrame.url = "data:text/html,recovery";
    call("minddy:focus");
    call("minddy:storage:flush");
    expect(deps.window.focus).toHaveBeenCalledTimes(1);
    expect(contents.session.flushStorageData).toHaveBeenCalledTimes(1);
  });
});
