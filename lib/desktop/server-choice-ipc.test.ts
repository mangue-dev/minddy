import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_IPC } from "./ipc-contract";
import { registerDesktopIpc, type DesktopIpcHandlers } from "./ipc-main";

const mocks = vi.hoisted(() => ({
  protocolHandle: vi.fn(),
}));
vi.mock("../../desktop/node_modules/electron", () => ({
  protocol: { handle: mocks.protocolHandle, registerSchemesAsPrivileged: vi.fn() },
}));

interface FakeEvent {
  sender: { isDestroyed(): boolean; send: (channel: string, ...args: unknown[]) => void };
  senderFrame: { url: string } | null;
}

const mainFrame = { url: "minddy-app://welcome/" };
const contents = { mainFrame, isDestroyed: () => false, send: vi.fn() };

function dependencies() {
  return {
    state: vi.fn(() => ({
      origin: "https://www.minddy.app",
      cloudOrigin: "https://www.minddy.app",
      isCustomServer: false,
      installFolder: "/x",
      installRunning: false,
      release: "0.20.1",
    })),
    useCloud: vi.fn(),
    connect: vi.fn(),
    useExistingInstallation: vi.fn().mockResolvedValue({}),
    prerequisites: vi.fn().mockResolvedValue([]),
    chooseInstallFolder: vi.fn().mockResolvedValue({}),
    install: vi.fn().mockResolvedValue({}),
    cancelInstall: vi.fn(),
    openExternal: vi.fn(),
    close: vi.fn(),
  };
}

async function setup() {
  const { serverChoiceHandlers } = await import("../../desktop/src/server-choice");
  const deps = dependencies();
  const channels = new Map<string, (event: FakeEvent, ...args: unknown[]) => unknown>();
  const register = (name: string, handler: (event: FakeEvent, ...args: unknown[]) => unknown) => {
    if (name.startsWith("minddy:server-choice:")) channels.set(name, handler);
  };
  const others = Object.fromEntries(
    Object.entries(DESKTOP_IPC).map(([name, entry]) => [name, entry.kind === "state" ? { ready: vi.fn() } : vi.fn()]),
  );
  registerDesktopIpc<FakeEvent>(
    {
      ipcMain: { on: register, handle: register },
      mainContents: () => contents,
      context: () => ({ origin: "https://www.minddy.app", localOrigin: "http://localhost:6463", customServerOrigin: null }),
    },
    { ...others, ...serverChoiceHandlers<FakeEvent>(deps) } as DesktopIpcHandlers<FakeEvent>,
  );
  const handler = (channel: string) => channels.get(`minddy:server-choice:${channel}`)!;
  return { deps, channels, handler };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mainFrame.url = "minddy-app://welcome/";
});

describe("server choice IPC", () => {
  it("answers the app's own self-hosting page in the main window", async () => {
    const { deps, handler } = await setup();
    const event = { sender: contents, senderFrame: mainFrame };
    expect(handler("state")(event)).toMatchObject({ installRunning: false });
    expect(handler("connect")(event, "https://tickets.example.com")).toEqual({});
    expect(deps.connect).toHaveBeenCalledWith("https://tickets.example.com");
    expect(handler("connect")(event, "ftp://nope")).toEqual({ error: { code: "serverInvalid" } });
    await handler("install")(event);
    const report = deps.install.mock.calls[0][0] as (progress: unknown) => void;
    report({ step: "clone", state: "running" });
    expect(contents.send).toHaveBeenCalledWith("minddy:server-choice:progress", { step: "clone", state: "running" });
  });

  it("refuses every channel to any server's page, another frame or another renderer", async () => {
    const { deps, channels } = await setup();
    const strangers = [
      { sender: contents, senderFrame: { url: "https://www.minddy.app/home" } },
      { sender: contents, senderFrame: { url: "minddy-app://welcome/" } },
      { sender: { isDestroyed: () => false, send: vi.fn() }, senderFrame: mainFrame },
      // The main window's top frame, showing a server's page.
      { sender: contents, senderFrame: mainFrame },
    ];
    mainFrame.url = "https://www.minddy.app/home";
    for (const event of strangers) {
      for (const [name, run] of channels) {
        await run(event, name.endsWith("connect") ? "https://tickets.example.com" : "docker");
      }
    }
    for (const fn of Object.values(deps)) expect(fn).not.toHaveBeenCalled();
  });

  it("opens download pages from a closed list only", async () => {
    const { deps, handler } = await setup();
    const event = { sender: contents, senderFrame: mainFrame };
    handler("tool-download")(event, "https://evil.example.com");
    handler("tool-download")(event, "supabase");
    expect(deps.openExternal).toHaveBeenCalledTimes(1);
    expect(deps.openExternal).toHaveBeenCalledWith("https://supabase.com/docs/guides/local-development/cli/getting-started");
  });
});

describe("the bundled page's scheme", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "minddy-welcome-"));
    writeFileSync(path.join(directory, "index.html"), "<!doctype html>");
    writeFileSync(path.join(directory, "welcome.js"), "export {};");
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  async function serve(url: string): Promise<Response> {
    const { serveServerChoicePage } = await import("../../desktop/src/server-choice");
    serveServerChoicePage(directory);
    const handler = mocks.protocolHandle.mock.calls.at(-1)![1] as (request: Request) => Promise<Response>;
    return handler(new Request(url));
  }

  it("serves its listed files with their type", async () => {
    const page = await serve("minddy-app://welcome/?env=production");
    expect(page.status).toBe(200);
    expect(page.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect((await serve("minddy-app://welcome/welcome.js")).headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
  });

  it("answers 404 to anything off the list, another host, or a missing file", async () => {
    expect((await serve("minddy-app://welcome/../../etc/passwd")).status).toBe(404);
    expect((await serve("minddy-app://welcome/main.js")).status).toBe(404);
    expect((await serve("minddy-app://other/")).status).toBe(404);
    expect((await serve("minddy-app://welcome/welcome.css")).status).toBe(404);
  });
});
