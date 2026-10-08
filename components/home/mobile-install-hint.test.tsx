// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { MobileInstallHint, PWA_PROMPT_DISMISSED_META_KEY } from "./mobile-install-hint";

const state = vi.hoisted(() => ({
  mobile: true,
  native: false,
  metadata: {} as Record<string, unknown>,
  updateMetadata: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "user", user_metadata: state.metadata }, updateUserMetadata: state.updateMetadata }) }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => state.mobile }));
vi.mock("@/lib/desktop/bridge", () => ({ isDesktop: () => state.native }));
vi.mock("next/image", () => ({ default: (props: React.ComponentProps<"img">) => <img {...props} /> }));
vi.mock("mangue-ui", async () => ({
  ...await import("../../node_modules/mangue-ui/src/components/ui/dialog"),
  ...await import("../../node_modules/mangue-ui/src/components/ui/sheet"),
  ...await import("../../node_modules/mangue-ui/src/components/ui/button"),
  ...await import("../../node_modules/mangue-ui/src/lib/utils"),
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let standalone: boolean;
beforeEach(() => {
  state.mobile = true; state.native = false; state.metadata = {};
  state.updateMetadata.mockReset().mockResolvedValue(undefined);
  standalone = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("navigator", { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 });
  vi.stubGlobal("matchMedia", () => ({ matches: standalone, addEventListener() {}, removeEventListener() {} }));
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(() => root.render(<NextIntlClientProvider locale="en" messages={messages}><MobileInstallHint /></NextIntlClientProvider>));
const openGuide = () => act(() => container.querySelector<HTMLButtonElement>('[data-home-pwa-hint] button')!.click());

describe("mobile home install hint", () => {
  it.each([
    { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 },
    { userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 5 },
  ])("opens only iOS instructions for iPhone and iPad probes ($platform)", async (probe) => {
    vi.stubGlobal("navigator", probe);
    await render(); await openGuide();
    const guide = document.querySelector('[data-pwa-install-guide="ios"]');
    expect(guide?.textContent).toContain(messages.Download.iosStepShareBody);
    expect(guide?.textContent).toContain(messages.Download.iosStepAddBody);
    expect(guide?.textContent).not.toContain(messages.DownloadMobile.androidMenuBody);
    expect(guide?.querySelectorAll("li")).toHaveLength(3);
    await act(() => guide?.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click());
    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(state.updateMetadata).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(container.querySelector('[data-home-pwa-hint] button'));
  });

  it("offers the Android menu path without requiring an install event", async () => {
    vi.stubGlobal("navigator", { userAgent: "Android", platform: "Linux", maxTouchPoints: 5 });
    await render(); await openGuide();
    const guide = document.querySelector('[data-pwa-install-guide="android"]');
    expect(guide?.querySelector("li")?.textContent).toContain(messages.DownloadMobile.androidMenuBody);
    expect(guide?.textContent).not.toContain(messages.Download.iosStepShareBody);
    expect(guide?.querySelectorAll("li")).toHaveLength(2);
  });

  it("consumes Android's native prompt from a tap and hides the hint after installation", async () => {
    vi.stubGlobal("navigator", { userAgent: "Android", platform: "Linux", maxTouchPoints: 5 });
    await render(); await openGuide();
    const prompt = vi.fn().mockResolvedValue({ outcome: "accepted", platform: "web" });
    await act(() => window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt })));
    const button = [...document.querySelectorAll<HTMLButtonElement>('[data-pwa-install-guide] button')].find(node => node.textContent === messages.Download.installUiInstallApp)!;
    await act(() => button.click());
    expect(prompt).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-home-pwa-hint]")).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the manual guide after a native install prompt is declined", async () => {
    vi.stubGlobal("navigator", { userAgent: "Android", platform: "Linux", maxTouchPoints: 5 });
    await render(); await openGuide();
    await act(() => window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: vi.fn().mockResolvedValue({ outcome: "dismissed" }) })));
    const button = [...document.querySelectorAll<HTMLButtonElement>('[data-pwa-install-guide] button')].find(node => node.textContent === messages.Download.installUiInstallApp)!;
    await act(() => button.click());
    expect(document.querySelector('[data-pwa-install-guide="android"]')?.textContent).toContain(messages.DownloadMobile.androidMenuBody);
    expect(container.querySelector("[data-home-pwa-hint]")).not.toBeNull();
  });

  it("persists dismissal separately from the desktop preference, even when saving fails", async () => {
    state.metadata = { desktop_prompt_dismissed: true };
    state.updateMetadata.mockRejectedValue(new Error("Offline"));
    await render();
    expect(container.querySelector("[data-home-pwa-hint]")).not.toBeNull();
    await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Don\'t show this again"]')!.click());
    expect(state.updateMetadata).toHaveBeenCalledExactlyOnceWith({ [PWA_PROMPT_DISMISSED_META_KEY]: true });
    expect(container.querySelector("[data-home-pwa-hint]")).toBeNull();
    await render();
    expect(container.querySelector("[data-home-pwa-hint]")).toBeNull();
  });

  it.each(["dismissed", "standalone", "ios-standalone", "native", "desktop-viewport", "desktop-platform"])("does not offer installation in %s mode", async (mode) => {
    if (mode === "dismissed") state.metadata[PWA_PROMPT_DISMISSED_META_KEY] = true;
    if (mode === "standalone") standalone = true;
    if (mode === "ios-standalone") vi.stubGlobal("navigator", { userAgent: "iPhone", standalone: true });
    if (mode === "native") state.native = true;
    if (mode === "desktop-viewport") state.mobile = false;
    if (mode === "desktop-platform") vi.stubGlobal("navigator", { userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 0 });
    await render();
    expect(container.querySelector("[data-home-pwa-hint]")).toBeNull();
  });

  it("removes an open guide when another install path succeeds", async () => {
    await render(); await openGuide();
    await act(() => window.dispatchEvent(new Event("appinstalled")));
    expect(container.querySelector("[data-home-pwa-hint]")).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
