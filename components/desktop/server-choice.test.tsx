// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { DesktopServerChoiceBridge } from "@/lib/desktop/bridge";
import type { LocalInstallProgress } from "@/lib/desktop/local-installer";
import { DesktopServerChoice } from "./server-choice";

const state = vi.hoisted(() => ({ bridge: null as Record<string, unknown> | null }));

vi.mock("@/lib/desktop/bridge", () => ({ getDesktopBridge: () => state.bridge }));

let container: HTMLDivElement;
let root: Root;
let progress: ((update: LocalInstallProgress) => void) | null;

function serverChoice(overrides: Partial<DesktopServerChoiceBridge> = {}): DesktopServerChoiceBridge {
  return {
    state: vi.fn().mockResolvedValue({
      origin: "https://www.minddy.app",
      cloudOrigin: "https://www.minddy.app",
      isCustomServer: false,
      installFolder: "/Users/camille/minddy",
      release: "0.20.1",
    }),
    useCloud: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue({ error: { code: "serverInvalid" } }),
    useExistingInstallation: vi.fn().mockResolvedValue({}),
    prerequisites: vi.fn().mockResolvedValue([
      { id: "git", state: "ready", version: "2.50.1" },
      { id: "node", state: "outdated", version: "22.12.0" },
      { id: "pnpm", state: "ready" },
      { id: "supabase", state: "missing" },
      { id: "docker", state: "stopped" },
    ]),
    chooseInstallFolder: vi.fn().mockResolvedValue({ folder: "/Users/camille/minddy" }),
    install: vi.fn(() => new Promise<{ error?: never }>(() => {})),
    cancelInstall: vi.fn(),
    onInstallProgress: vi.fn((handler) => {
      progress = handler;
      return () => {};
    }),
    openToolDownload: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
}

async function render() {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DesktopServerChoice env="production" />
      </NextIntlClientProvider>,
    );
  });
}

const click = async (label: string) => {
  const target = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
  if (!target) throw new Error(`No button “${label}”`);
  await act(async () => target.click());
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  progress = null;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DesktopServerChoice", () => {
  it("opens on self-hosting, and its way back is the app itself", async () => {
    const bridge = serverChoice();
    state.bridge = { serverChoice: bridge, openExternal: vi.fn() };
    await render();
    expect(container.textContent).toContain(messages.DesktopWelcome.selfHostHeading);
    await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${messages.DesktopWelcome.backToApp}"]`)!.click());
    expect(bridge.close).toHaveBeenCalledOnce();
  });

  it("leads back through the breadcrumb", async () => {
    const bridge = serverChoice();
    state.bridge = { serverChoice: bridge, openExternal: vi.fn() };
    await render();
    await click(messages.DesktopWelcome.existingTitle);
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe(messages.DesktopWelcome.existingTitle);
    await click(messages.DesktopWelcome.selfHostHeading);
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe(messages.DesktopWelcome.selfHostHeading);
  });

  it("groups every existing installation, local or remote, on one step", async () => {
    const bridge = serverChoice();
    state.bridge = { serverChoice: bridge, openExternal: vi.fn() };
    await render();
    expect(container.querySelector("#server-address")).toBeNull();
    await click(messages.DesktopWelcome.existingTitle);
    expect(container.textContent).toContain(messages.DesktopWelcome.localFolderTitle);
    expect(container.querySelector("#server-address")).not.toBeNull();
    await click(messages.DesktopWelcome.localFolderTitle);
    expect(bridge.useExistingInstallation).toHaveBeenCalledOnce();
  });

  it("opens the server installation guide in the browser", async () => {
    const openExternal = vi.fn();
    state.bridge = { serverChoice: serverChoice(), openExternal };
    await render();
    await click(messages.DesktopWelcome.serverInstallTitle);
    expect(openExternal).toHaveBeenCalledWith("https://www.minddy.app/self-hosting/install?route=team");
  });

  it("connects to a server and shows the refusal in the page's language", async () => {
    const bridge = serverChoice();
    state.bridge = { serverChoice: bridge, openExternal: vi.fn() };
    await render();
    await click(messages.DesktopWelcome.existingTitle);
    const input = container.querySelector<HTMLInputElement>("#server-address")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "ftp://nope");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(bridge.connect).toHaveBeenCalledWith("ftp://nope");
    expect(container.textContent).toContain(messages.DesktopWelcome.serverInvalid);
  });

  it("says what the installer will install, then lists the tool steps it runs", async () => {
    const bridge = serverChoice();
    state.bridge = { serverChoice: bridge, openExternal: vi.fn() };
    await render();
    await click(messages.DesktopWelcome.installTitle);
    expect(container.textContent).toContain("Version 22.12.0 found; Node.js 24 will be installed for minddy");
    expect(container.textContent).toContain(messages.DesktopWelcome.requirementWillInstall);
    expect(container.textContent).toContain(messages.DesktopWelcome.requirementWillStart);
    expect(container.textContent).not.toContain("Download");

    // No email: the app creates and signs in its own local account.
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.textContent).toContain(messages.DesktopWelcome.accountNote);
    await click(messages.DesktopWelcome.install);
    expect(bridge.install).toHaveBeenCalledWith();
    await act(async () => {
      progress?.({ step: "node", state: "done" });
      progress?.({ step: "docker-start", state: "failed", detail: { code: "dockerTimeout" } });
    });
    expect(container.textContent).toContain(messages.DesktopWelcome.stepNode);
    expect(container.textContent).toContain(messages.DesktopWelcome.dockerTimeout);
    expect(container.textContent).not.toContain(messages.DesktopWelcome.stepGit);
    await click(messages.DesktopWelcome.installManually);
    expect(bridge.openToolDownload).toHaveBeenCalledWith("docker");
  });
});
