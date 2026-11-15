import { beforeEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_IPC, type DesktopSenderPolicy } from "./ipc-contract";
import { desktopSenderAllowed, registerDesktopIpc, type DesktopIpcHandlers } from "./ipc-main";

interface FakeEvent {
  sender: unknown;
  senderFrame: { url: string } | null;
}

const mainFrame = { url: "https://www.minddy.app/home" };
const contents = { mainFrame };
const context = {
  origin: "https://www.minddy.app",
  localOrigin: "http://localhost:6463",
  customServerOrigin: null as string | null,
};

/** One spy per handler, so a test can see which ones ran. */
function spyHandlers() {
  const handlers: Record<string, unknown> = {};
  for (const [channel, entry] of Object.entries(DESKTOP_IPC)) {
    if (entry.kind === "invoke") handlers[channel] = vi.fn(() => "answered");
    else if (entry.kind === "send") handlers[channel] = vi.fn();
    else if (entry.kind === "state") handlers[channel] = { ready: vi.fn(), notReady: vi.fn() };
  }
  return handlers as unknown as DesktopIpcHandlers<FakeEvent> & Record<string, ReturnType<typeof vi.fn>>;
}

function setup() {
  const listeners = new Map<string, (event: FakeEvent, ...args: unknown[]) => unknown>();
  const register = (channel: string, listener: (event: FakeEvent, ...args: unknown[]) => unknown) => {
    expect(listeners.has(channel), `${channel} registered twice`).toBe(false);
    listeners.set(channel, listener);
  };
  const handlers = spyHandlers();
  registerDesktopIpc<FakeEvent>(
    { ipcMain: { on: register, handle: register }, mainContents: () => contents, context: () => context },
    handlers,
  );
  const call = (channel: string, event: FakeEvent, ...args: unknown[]) => listeners.get(channel)!(event, ...args);
  return { listeners, handlers, call };
}

function documentAt(url: string): FakeEvent {
  mainFrame.url = url;
  return { sender: contents, senderFrame: mainFrame };
}

beforeEach(() => {
  mainFrame.url = "https://www.minddy.app/home";
  context.customServerOrigin = null;
});

describe("registerDesktopIpc", () => {
  it("listens on every channel the contract declares, and on nothing else", () => {
    const { listeners } = setup();
    const expected = Object.entries(DESKTOP_IPC).flatMap(([channel, entry]) => {
      if (entry.kind === "state") return entry.notReady ? [entry.ready, entry.notReady] : [entry.ready];
      return entry.kind === "event" ? [] : [channel];
    });
    expect([...listeners.keys()].sort()).toEqual(expected.sort());
  });

  it("answers a refused call with the contract's refusal and never runs its handler", async () => {
    const { handlers, call } = setup();
    const otherFrame = { sender: contents, senderFrame: { url: "https://www.minddy.app/home" } };
    expect(await call("minddy:local-runtime:restart", otherFrame)).toBe(false);
    expect(await call("minddy:server-choice:install", documentAt("https://www.minddy.app/home"))).toEqual({
      error: { code: "localStartFailed" },
    });
    expect(await call("minddy:push:register", { sender: {}, senderFrame: mainFrame })).toBeNull();
    expect(handlers["minddy:local-runtime:restart"]).not.toHaveBeenCalled();
    expect(handlers["minddy:server-choice:install"]).not.toHaveBeenCalled();
    expect(handlers["minddy:push:register"]).not.toHaveBeenCalled();
  });

  it("hands the handler parsed arguments only", async () => {
    const { handlers, call } = setup();
    const page = documentAt("https://www.minddy.app/home");

    call("minddy:set-badge", page, "12");
    call("minddy:set-badge", page, 3.7);
    expect(vi.mocked(handlers["minddy:set-badge"]).mock.calls.map(([, count]) => count)).toEqual([0, 3]);

    call("minddy:notification:show", page, { id: "a", title: "", body: "" });
    call("minddy:open-agent-app", page, "claude://code/settings");
    call("minddy:window-chrome", page, "sepia");
    expect(handlers["minddy:notification:show"]).not.toHaveBeenCalled();
    expect(handlers["minddy:open-agent-app"]).not.toHaveBeenCalled();
    expect(handlers["minddy:window-chrome"]).not.toHaveBeenCalled();

    call("minddy:window-chrome", page, "dark", "yes");
    expect(handlers["minddy:window-chrome"]).toHaveBeenCalledWith(page, "dark", undefined);

    expect(await call("minddy:linux-background:set", page, "true")).toBeNull();
    expect(await call("minddy:local-models:discover", page, { provider: "ollama" })).toEqual({
      ok: false,
      reason: "invalid_endpoint",
    });
    await call("minddy:push:register", page, { activate: "yes" });
    expect(handlers["minddy:push:register"]).toHaveBeenCalledWith(page, { activate: false });

    // A channel without arguments ignores whatever the page adds.
    await call("minddy:update:check", page, "/etc/passwd");
    expect(handlers["minddy:update:check"]).toHaveBeenCalledWith(page);
  });

  it("replays a state only to a subscriber its policy admits", () => {
    const { handlers, call } = setup();
    const authLink = handlers["minddy:auth-link"] as unknown as { ready: ReturnType<typeof vi.fn> };
    call("minddy:auth-link-ready", documentAt("data:text/html,recovery"));
    expect(authLink.ready).not.toHaveBeenCalled();
    const page = documentAt("https://www.minddy.app/login");
    call("minddy:auth-link-ready", page);
    expect(authLink.ready).toHaveBeenCalledExactlyOnceWith(page);
  });
});

describe("desktopSenderAllowed", () => {
  const documents = {
    app: "https://www.minddy.app/home",
    welcome: "minddy-app://welcome/?env=production",
    recovery: "data:text/html;charset=utf-8,recovery",
    local: "http://localhost:6463/home",
    elsewhere: "https://evil.example.com/",
  };
  const admitted = (policy: DesktopSenderPolicy, customServerOrigin: string | null = null) =>
    Object.entries(documents)
      .filter(([, url]) =>
        desktopSenderAllowed(policy, url, {
          ...context,
          origin: customServerOrigin ?? context.origin,
          customServerOrigin,
        }),
      )
      .map(([name]) => name);

  it("admits each policy's documents only", () => {
    expect(admitted("window")).toEqual(Object.keys(documents));
    expect(admitted("app")).toEqual(["app"]);
    expect(admitted("welcome")).toEqual(["welcome"]);
    expect(admitted("local")).toEqual([]);
    expect(admitted("local", "http://localhost:6463")).toEqual(["local"]);
    expect(admitted("app", "https://tickets.example.com")).toEqual([]);
  });

  it("refuses every policy outside the main window's top frame", () => {
    for (const policy of ["window", "app", "local", "welcome"] as const) {
      expect(desktopSenderAllowed(policy, null, context)).toBe(false);
    }
  });
});
