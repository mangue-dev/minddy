// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { isPublicWebsiteUrl, openPublicLinksOutside } from "./public-links";

const origin = "https://www.minddy.app";

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  document.body.innerHTML = "";
});

describe("isPublicWebsiteUrl", () => {
  it("knows the public site, in every language, and the manual", () => {
    for (const path of ["/", "/pricing", "/fr", "/privacy", "/cookies", "/docs", "/download/"]) {
      expect(isPublicWebsiteUrl(new URL(path, origin), origin), path).toBe(true);
    }
  });

  it("leaves the product's pages, and other servers, to the app", () => {
    expect(isPublicWebsiteUrl(new URL("/home", origin), origin)).toBe(false);
    expect(isPublicWebsiteUrl(new URL("/projects/min-3f2a9c81/objectives", origin), origin)).toBe(false);
    expect(isPublicWebsiteUrl(new URL("/settings", origin), origin)).toBe(false);
    expect(isPublicWebsiteUrl(new URL("https://example.com/pricing"), origin)).toBe(false);
  });
});

describe("openPublicLinksOutside", () => {
  function stubShell(shell: Record<string, unknown>) {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { MinddyShell: shell } };
  }
  const click = (href: string) => {
    const link = document.createElement("a");
    link.href = href;
    document.body.append(link);
    // What the capture listener decided, read before jsdom would navigate.
    let prevented = false;
    const settle = (event: Event) => { prevented = event.defaultPrevented; event.preventDefault(); };
    document.addEventListener("click", settle);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    document.removeEventListener("click", settle);
    return prevented;
  };

  it("opens the public site in Safari's sheet and keeps app links in the app", () => {
    const openBrowser = vi.fn(() => Promise.resolve());
    stubShell({ openBrowser });
    const stop = openPublicLinksOutside(document);
    const here = window.location.origin;
    expect(click(`${here}/pricing`)).toBe(true);
    expect(openBrowser).toHaveBeenCalledWith({ url: `${here}/pricing` });
    expect(click(`${here}/home`)).toBe(false);
    expect(openBrowser).toHaveBeenCalledTimes(1);
    stop();
    expect(click(`${here}/pricing`)).toBe(false);
  });

  it("changes nothing in a shell without the method, or in a browser", () => {
    stubShell({});
    openPublicLinksOutside(document)();
    expect(click(`${window.location.origin}/pricing`)).toBe(false);
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    openPublicLinksOutside(document)();
    expect(click(`${window.location.origin}/pricing`)).toBe(false);
  });
});
