import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
  protocolHandle: vi.fn(),
}));
vi.mock("../../desktop/node_modules/electron", () => ({
  ipcMain: { handle: mocks.handle, on: mocks.on },
  protocol: { handle: mocks.protocolHandle, registerSchemesAsPrivileged: vi.fn() },
}));

const mainFrame = { url: "minddy-app://welcome/" };
const contents = { mainFrame, isDestroyed: () => false, send: vi.fn() };

function dependencies() {
  return {
    contents: () => contents as never,
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
  const { registerServerChoiceIpc } = await import("../../desktop/src/server-choice");
  const deps = dependencies();
  registerServerChoiceIpc(deps);
  const channels = new Map<string, (event: unknown, ...args: unknown[]) => unknown>(
    [...mocks.handle.mock.calls, ...mocks.on.mock.calls].map(([name, handler]) => [name, handler]),
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
    expect(deps.install).toHaveBeenCalledWith(expect.any(Function));
  });

  it("refuses every channel to any server's page, another frame or another renderer", async () => {
    const { deps, channels } = await setup();
    const strangers = [
      { sender: contents, senderFrame: { url: "https://www.minddy.app/home" } },
      { sender: contents, senderFrame: { url: "minddy-app://welcome/" } },
      { sender: {}, senderFrame: mainFrame },
    ];
    for (const event of strangers) {
      for (const [name, run] of channels) {
        await run(event, name.endsWith("connect") ? "https://tickets.example.com" : "docker");
      }
    }
    const { contents: _contents, ...actions } = deps;
    for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled();
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
