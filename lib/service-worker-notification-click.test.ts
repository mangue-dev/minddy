import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const SOURCE = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const ORIGIN = "https://minddy.test";

/** Loads the push service worker in a sandbox and returns its click handler. */
function loadClickHandler() {
  const listeners = new Map<string, (event: unknown) => void>();
  const openWindow = vi.fn(async () => null);
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    clients: { matchAll: vi.fn(async () => []), openWindow },
    registration: {},
  };
  runInNewContext(SOURCE, { self, URL, console });
  const handler = listeners.get("notificationclick");
  if (!handler) throw new Error("no notificationclick listener");
  return {
    openWindow,
    async click(url: unknown) {
      let work: Promise<unknown> = Promise.resolve();
      handler({
        notification: { close: () => {}, data: url === undefined ? undefined : { url } },
        waitUntil: (promise: Promise<unknown>) => (work = promise),
      });
      await work;
    },
  };
}

describe("push notification click", () => {
  it("opens a same-origin path", async () => {
    const sw = loadClickHandler();
    await sw.click("/projects/min-3f2a9c81?issue=MIN-42");
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/projects/min-3f2a9c81?issue=MIN-42`);
  });

  it("falls back to the inbox for another origin", async () => {
    const sw = loadClickHandler();
    await sw.click("https://evil.example/phish");
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/inbox`);
  });

  it("falls back to the inbox for a protocol-relative URL", async () => {
    const sw = loadClickHandler();
    await sw.click("//evil.example/phish");
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/inbox`);
  });

  it("opens the inbox without a URL", async () => {
    const sw = loadClickHandler();
    await sw.click(undefined);
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/inbox`);
  });
});
