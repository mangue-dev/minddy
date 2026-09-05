// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DownloadPlatformCards,
  type DownloadPlatformCardsProps,
} from "@/components/marketing/download-platform-cards";
import {
  MobilePwaInstallGuide,
  type MobileInstallGuideCopy,
} from "@/components/marketing/mobile-pwa-install-guide";
import type { Locale } from "@/i18n/config";
import { WINDOWS_STORE_DEEP_LINK } from "@/lib/desktop/install-prompt";

const copy: DownloadPlatformCardsProps = {
  copy: {
    download: "Download", guide: "Installation guide", architecture: "Processor",
    macBody: "For Apple silicon and Intel.", windowsBody: "The Windows app.",
    windowsUpdates: "Automatic updates.", linuxBody: "AppImage and signed packages.",
    iosBody: "Install from Safari.", androidBody: "Install from Chrome.", iosTitle: "iPhone and iPad",
    androidInstall: "Install on Android", mobileTitle: "Take your projects with you.", mobileBody: "A mobile PWA.",
  },
  macRelease: { arm64: "1.2.3 · 120 MB", x64: "1.2.3 · 130 MB" },
  linuxRelease: { arm64: "1.2.3 · 140 MB", x64: "1.2.3 · 150 MB" },
  guides: { macos: "/download/macos", linux: "/download/linux", windows: "/download/windows", mobile: "/download/mobile-pwa" },
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

describe("DownloadPlatformCards", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
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
    await act(async () => root.render(createElement(DownloadPlatformCards, copy)));
  }

  async function renderWithGuide(locale: Locale = "en") {
    await act(async () =>
      root.render(
        createElement(
          "div",
          null,
          createElement(DownloadPlatformCards, copy),
          createElement(MobilePwaInstallGuide, { copy: guideCopy, locale }),
        ),
      ),
    );
  }

  function card(platform: string) {
    const element = container.querySelector<HTMLElement>(`article[data-platform="${platform}"]`);
    if (!element) throw new Error(`Missing ${platform} card`);
    return element;
  }

  function chooseArch(platform: string, arch: string) {
    const select = card(platform).querySelector("select");
    if (!select) throw new Error("Missing architecture choice");
    act(() => {
      select.value = arch;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("keeps all five platforms and their guides available regardless of the current device", async () => {
    setNavigatorProbe({ userAgentDataPlatform: "Windows" });
    await render();
    expect(container.querySelectorAll("article[data-platform]")).toHaveLength(5);
    expect(card("windows").querySelector(`a[href="${WINDOWS_STORE_DEEP_LINK}"]`)).not.toBeNull();
    expect(card("macos").querySelector('a[href="/api/desktop/download"]')).not.toBeNull();
    for (const platform of ["macos", "linux", "windows"] as const) {
      expect(card(platform).querySelector(`a[href="${copy.guides[platform]}"]`)).not.toBeNull();
    }
  });

  it("changes the Mac package and release size together when Intel is selected", async () => {
    await render();
    chooseArch("macos", "x64");
    expect(card("macos").querySelector('a[href="/api/desktop/download?arch=x64"]')).not.toBeNull();
    expect(card("macos").textContent).toContain("130 MB");
    expect(card("macos").textContent).not.toContain("120 MB");
    chooseArch("macos", "arm64");
    expect(card("macos").querySelector('a[href="/api/desktop/download"]')).not.toBeNull();
  });

  it.each(["x64", "arm64"])("offers each Linux format for %s with matching metadata", async arch => {
    await render();
    chooseArch("linux", arch);
    for (const format of ["AppImage", "deb", "rpm"]) {
      expect(card("linux").querySelector(`a[href="/api/desktop/download?platform=linux&format=${format}&arch=${arch}"]`)).not.toBeNull();
    }
    expect(card("linux").textContent).toContain(arch === "arm64" ? "140 MB" : "150 MB");
  });

  it("opens the native Android prompt once and then restores the guide fallback", async () => {
    setNavigatorProbe({ userAgentDataPlatform: "Android", userAgent: "Mozilla/5.0 Android" });
    await render();
    const prompt = vi.fn().mockResolvedValue({ outcome: "accepted", platform: "web" });
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt });
    act(() => window.dispatchEvent(event));
    const button = card("android").querySelector("button");
    expect(button?.textContent).toContain("Install on Android");
    await act(async () => button?.click());
    expect(prompt).toHaveBeenCalledOnce();
    expect(card("android").querySelector(`a[href="${copy.guides.mobile}"]`)).not.toBeNull();
  });

  it("does not offer a desktop PWA prompt as an Android installation", async () => {
    setNavigatorProbe({ userAgentDataPlatform: "Windows" });
    await render();
    const prompt = vi.fn();
    act(() => window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt })));
    expect(card("android").querySelector("button")).toBeNull();
    expect(card("android").querySelector(`a[href="${copy.guides.mobile}"]`)).not.toBeNull();
  });

  it.each(["ios", "android"])("opens the %s tutorial from its card on a desktop browser", async platform => {
    setNavigatorProbe({ userAgentDataPlatform: "macOS" });
    await renderWithGuide();
    act(() => card(platform).querySelector<HTMLAnchorElement>(`a[href="${copy.guides.mobile}"]`)?.click());
    expect(container.querySelector("section#mobile-install-guide h2")?.textContent).toBe(
      platform === "ios" ? guideCopy.iosTitle : guideCopy.androidTitle,
    );
  });

  it("uses the current locale for the Android guide screenshot", async () => {
    setNavigatorProbe({ userAgentDataPlatform: "Android", userAgent: "Mozilla/5.0 Android" });
    await renderWithGuide("de");
    expect(Array.from(container.querySelectorAll("img")).some(image =>
      decodeURIComponent(image.getAttribute("src") ?? "").includes("heroBoard-de-light.webp"),
    )).toBe(true);
  });
});
