import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), on: vi.fn() }));
vi.mock("../../desktop/node_modules/electron", () => ({ ipcMain: mocks, protocol: {} }));

const mainFrame = { url: "minddy-app://welcome/" };
const contents = { mainFrame };

async function setup() {
  const { registerServerChoiceIpc } = await import("../../desktop/src/server-choice");
  const deps = {
    contents: () => contents as never,
    state: vi.fn(() => ({ origin: "https://www.minddy.app", cloudOrigin: "https://www.minddy.app", isCustomServer: false, installFolder: "/x", release: "0.20.1" })),
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
  registerServerChoiceIpc(deps);
  const handler = (channel: string) =>
    [...mocks.handle.mock.calls, ...mocks.on.mock.calls].find(([name]) => name === `minddy:server-choice:${channel}`)![1];
  return { deps, handler };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mainFrame.url = "minddy-app://welcome/";
});

describe("server choice IPC", () => {
  it("answers the app's own server-choice page in the main window", async () => {
    const { deps, handler } = await setup();
    const event = { sender: contents, senderFrame: mainFrame };
    expect(handler("state")(event)).toMatchObject({ isCustomServer: false });
    expect(handler("connect")(event, "https://tickets.example.com")).toEqual({});
    expect(deps.connect).toHaveBeenCalledWith("https://tickets.example.com");
    expect(handler("connect")(event, "ftp://nope")).toEqual({ error: { code: "serverInvalid" } });
  });

  it("ignores any server's page, another frame or another renderer", async () => {
    const { deps, handler } = await setup();
    mainFrame.url = "https://www.minddy.app/home";
    handler("cloud")({ sender: contents, senderFrame: mainFrame });
    expect(handler("state")({ sender: contents, senderFrame: mainFrame })).toBeNull();
    mainFrame.url = "minddy-app://welcome/";
    handler("cloud")({ sender: contents, senderFrame: { url: mainFrame.url } });
    handler("cloud")({ sender: {}, senderFrame: mainFrame });
    expect(deps.useCloud).not.toHaveBeenCalled();
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
