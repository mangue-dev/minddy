// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.minddy.app/account/preferences"}

import { act, createElement } from "react";
import type * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountDesktopSection } from "@/components/settings/account-desktop-section";
import type { DesktopBridge } from "@/lib/desktop/bridge";
import * as channelModule from "@/lib/desktop/channel";
import messages from "@/messages/en.json";

vi.mock("mangue-ui", async () => {
  const { createElement: element, Fragment } = await import("react");
  return {
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
    Button: ({
      children,
      variant: _variant,
      size: _size,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: string;
      size?: string;
    }) => element("button", props, children),
    Switch: ({
      checked,
      onCheckedChange,
      ...props
    }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
      checked: boolean;
      onCheckedChange: (checked: boolean) => void;
    }) =>
      element("button", {
        ...props,
        role: "switch",
        "aria-checked": checked,
        onClick: () => onCheckedChange(!checked),
      }),
    Popover: ({ children }: React.PropsWithChildren) => element(Fragment, null, children),
    PopoverTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      element("button", props, children),
    PopoverContent: ({ children }: React.PropsWithChildren) =>
      element("div", null, children),
  };
});

type BridgeMocks = {
  bridge: DesktopBridge;
  openServerPicker: ReturnType<typeof vi.fn>;
  checkForUpdates: ReturnType<typeof vi.fn>;
  copyDiagnosticReport: ReturnType<typeof vi.fn>;
  setChannel: ReturnType<typeof vi.fn>;
};

function currentBridge(): BridgeMocks {
  const openServerPicker = vi.fn();
  const checkForUpdates = vi.fn().mockResolvedValue(undefined);
  const copyDiagnosticReport = vi.fn().mockResolvedValue(true);
  const setChannel = vi.fn();
  const bridge = {
    version: "1.2.3",
    platform: "win32",
    openServerPicker,
    checkForUpdates,
    copyDiagnosticReport,
    setChannel,
  } as unknown as DesktopBridge;
  return {
    bridge,
    openServerPicker,
    checkForUpdates,
    copyDiagnosticReport,
    setChannel,
  };
}

function legacyBridge(): DesktopBridge {
  return {
    version: "1.0.0",
    platform: "linux",
    setChannel: vi.fn(),
  } as unknown as DesktopBridge;
}

describe("AccountDesktopSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete window.minddy;
    vi.restoreAllMocks();
    delete (window as typeof window & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderSection() {
    await act(async () => {
      root.render(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement(AccountDesktopSection),
        }),
      );
    });
  }

  function button(label: string): HTMLButtonElement {
    const match = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label,
    );
    if (!match) throw new Error(`Missing button: ${label}`);
    return match;
  }

  it("does not render in a browser", async () => {
    await renderSection();
    expect(container.textContent).toBe("");
  });

  it("renders Cloud state and routes each control to its argument-free bridge action", async () => {
    const mocks = currentBridge();
    window.minddy = mocks.bridge;
    await renderSection();

    expect(container.textContent).toContain("https://www.minddy.app");
    expect(container.textContent).toContain("minddy 1.2.3");
    expect(container.textContent).toContain("Preview the latest features");

    act(() => button("Change…").click());
    expect(mocks.openServerPicker).toHaveBeenCalledWith();
    expect(mocks.checkForUpdates).not.toHaveBeenCalled();
    expect(mocks.copyDiagnosticReport).not.toHaveBeenCalled();

    await act(async () => button("Check for updates…").click());
    expect(mocks.checkForUpdates).toHaveBeenCalledWith();
    expect(mocks.copyDiagnosticReport).not.toHaveBeenCalled();

    await act(async () => button("Copy report…").click());
    expect(mocks.copyDiagnosticReport).toHaveBeenCalledWith();
    expect(container.textContent).toContain("Copied");

    const previewSwitch = container.querySelector<HTMLButtonElement>(
      'button[role="switch"]',
    );
    act(() => previewSwitch?.click());
    expect(mocks.setChannel).toHaveBeenCalledWith("preview");
  });

  it("renders on a custom origin without the Cloud preview switch", async () => {
    vi.spyOn(channelModule, "desktopChannelForOrigin").mockReturnValue(null);
    window.minddy = currentBridge().bridge;
    await renderSection();

    expect(container.textContent).toContain("Connected server");
    expect(container.textContent).toContain(window.location.origin);
    expect(container.textContent).not.toContain("Preview the latest features");
  });

  it("keeps the card compatible with a legacy shell", async () => {
    window.minddy = legacyBridge();
    await renderSection();

    expect(container.textContent).toContain("minddy 1.0.0");
    expect(container.textContent).toContain("Preview the latest features");
    expect(container.textContent).not.toContain("Change…");
    expect(container.textContent).not.toContain("Check for updates…");
    expect(container.textContent).not.toContain("Copy report…");
  });
});
