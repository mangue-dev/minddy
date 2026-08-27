// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DownloadPlatformCta,
  type DownloadPlatformCtaProps,
} from "@/components/marketing/download-platform-cta";
import {
  MobilePwaInstallGuide,
  type MobileInstallGuideCopy,
} from "@/components/marketing/mobile-pwa-install-guide";
import { WINDOWS_STORE_DEEP_LINK } from "@/lib/desktop/install-prompt";

const copy: DownloadPlatformCtaProps = {
  macLabel: "Download for Mac",
  macIntelLabel: "Mac with an Intel chip",
  linuxLabel: "Download AppImage for Linux",
  linuxArmLabel: "AppImage for ARM64",
  linuxBody: "Portable Linux app.",
  linuxReleaseLabel: "Linux 1.2.3 · 100 MB",
  linuxPackagesLabel: "Other Linux packages.",
  linuxDebX64Label: "Download .deb (x64)",
  linuxRpmX64Label: "Download .rpm (x64)",
  linuxDebArm64Label: "Download .deb (ARM64)",
  linuxRpmArm64Label: "Download .rpm (ARM64)",
  windowsLabel: "Get it from Microsoft Store",
  androidLabel: "Install on Android",
  iosLabel: "Install on iPhone",
  tutorialLabel: "View installation guide",
  selectorLabel: "Choose a platform",
};

const guideCopy: MobileInstallGuideCopy = {
  iosEyebrow: "iPhone and iPad",
  iosTitle: "Put minddy on your Home Screen",
  iosBody: "Install from Safari.",
  iosStepShareTitle: "Open Share",
  iosStepShareBody: "Tap Share.",
  iosStepHomeTitle: "Choose Home Screen",
  iosStepHomeBody: "Tap Add to Home Screen.",
  iosStepAddTitle: "Confirm the web app",
  iosStepAddBody: "Tap Add.",
  androidEyebrow: "Android",
  androidTitle: "Install minddy like an app",
  androidBody: "Install from your browser.",
  androidStepPromptTitle: "Tap Install",
  androidStepPromptBody: "Confirm the browser window.",
  androidStepMenuTitle: "If no window appears",
  androidStepMenuBody: "Open the browser menu.",
  uiShare: "Share",
  uiAddToHome: "Add to Home Screen",
  uiOpenAsWebApp: "Open as Web App",
  uiAdd: "Add",
  uiCancel: "Cancel",
  uiInstallApp: "Install app",
  uiInstall: "Install",
  uiNotNow: "Not now",
  uiCopy: "Copy",
  uiSettings: "Settings",
};

function setNavigatorProbe(input: {
  userAgentDataPlatform?: string;
  platform?: string;
  userAgent?: string;
  maxTouchPoints?: number;
}) {
  Object.defineProperties(window.navigator, {
    userAgentData: {
      configurable: true,
      value: input.userAgentDataPlatform ? { platform: input.userAgentDataPlatform } : undefined,
    },
    platform: { configurable: true, value: input.platform ?? "" },
    userAgent: { configurable: true, value: input.userAgent ?? "" },
    maxTouchPoints: { configurable: true, value: input.maxTouchPoints ?? 0 },
  });
}

describe("DownloadPlatformCta", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
    delete (window as typeof window & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  async function render() {
    await act(async () => root.render(createElement(DownloadPlatformCta, copy)));
  }

  async function renderWithGuide() {
    await act(async () =>
      root.render(
        createElement(
          "div",
          null,
          createElement(DownloadPlatformCta, copy),
          createElement(MobilePwaInstallGuide, { copy: guideCopy }),
        ),
      ),
    );
  }

  function platformButton(platform: string): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(
      `button[data-platform="${platform}"]`,
    );
    if (!button) throw new Error(`Missing ${platform} selector button`);
    return button;
  }

  it("selects the detected desktop platform and presents its primary action", async () => {
    setNavigatorProbe({ userAgentDataPlatform: "Windows" });
    await render();

    expect(platformButton("windows").getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector<HTMLAnchorElement>(`a[href="${WINDOWS_STORE_DEEP_LINK}"]`)
        ?.textContent,
    ).toContain("Microsoft Store");
  });

  it("falls back to macOS when the platform is unsupported", async () => {
    setNavigatorProbe({ platform: "FreeBSD", userAgent: "ExampleBrowser/1.0" });
    await render();

    expect(platformButton("macos").getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="/api/desktop/download"]')?.textContent,
    ).toContain("Download for Mac");
  });

  it("keeps every platform available and updates the installer after manual selection", async () => {
    setNavigatorProbe({ userAgentDataPlatform: "macOS" });
    await render();

    expect(container.querySelectorAll("button[data-platform]")).toHaveLength(5);
    act(() => platformButton("linux").click());

    expect(platformButton("macos").getAttribute("aria-pressed")).toBe("false");
    expect(platformButton("linux").getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="/api/desktop/download?platform=linux&format=AppImage&arch=x64"]',
      )?.textContent,
    ).toContain("Linux");
  });

  it("opens the native install prompt on a compatible Android browser", async () => {
    setNavigatorProbe({ userAgentDataPlatform: "Android", userAgent: "Mozilla/5.0 Android" });
    await render();
    const prompt = vi.fn().mockResolvedValue({ outcome: "accepted", platform: "web" });
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt });

    act(() => window.dispatchEvent(event));
    const installButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Install on Android"),
    );
    await act(async () => installButton?.click());

    expect(prompt).toHaveBeenCalledOnce();
  });

  it("offers the tutorial when native mobile installation is unavailable", async () => {
    setNavigatorProbe({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    await render();

    expect(platformButton("ios").getAttribute("aria-pressed")).toBe("true");
    const tutorial = container.querySelector<HTMLAnchorElement>('a[href="#mobile-install-guide"]');
    expect(tutorial?.textContent).toBe("View installation guide");
    expect(tutorial?.dataset.variant).toBe("outline");
  });

  it("shows a manually selected mobile tutorial on desktop", async () => {
    setNavigatorProbe({ userAgentDataPlatform: "macOS" });
    await renderWithGuide();

    act(() => platformButton("android").click());
    const tutorial = container.querySelector<HTMLAnchorElement>('a[href="#mobile-install-guide"]');
    act(() => tutorial?.click());

    expect(container.querySelector("section#mobile-install-guide h2")?.textContent).toBe(
      "Install minddy like an app",
    );
  });
});
