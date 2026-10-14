import { describe, expect, it, vi } from "vitest";
import { createAllStartupTiming, measureAllStartupPhase } from "./all-startup-timing";

describe("explicit All startup timing admission", () => {
  it("stays disabled without the exact diagnostic header and preserves the original promise", () => {
    for (const headers of [new Headers(), new Headers({ "x-minddy-performance-diagnostic": "other" }),
      new Headers({ "x-minddy-performance-diagnostic": "all-startup-v1, other" })]) {
      const timing = createAllStartupTiming({ headers });
      expect(timing).toBeUndefined();
      const pending = Promise.resolve("accepted");
      expect(measureAllStartupPhase(timing, "issues", () => pending)).toBe(pending);
    }
  });

  it("emits only fixed metrics and counts, never operation results or error messages", async () => {
    const timing = createAllStartupTiming({ headers: new Headers({ "x-minddy-performance-diagnostic": "all-startup-v1" }) })!;
    const privateValue = { id: "private-id", token: "private-token", title: "Private document" };
    expect(await timing.span("auth", async () => privateValue)).toBe(privateValue);
    const failure = new Error("Private database text");
    await expect(timing.span("issues_db", async () => { throw failure; })).rejects.toBe(failure);
    await timing.span("issues_db", async () => []);
    const response = timing.sync("json", () => new Response("unchanged body"));
    const decorated = timing.decorate(response);
    expect(decorated).toBe(response);
    expect(await decorated.text()).toBe("unchanged body");
    const metadata = decorated.headers.get("Server-Timing")!;
    expect(metadata).toMatch(/^all_total;dur=\d+\.\d, all_auth;dur=\d+\.\d;desc="calls:1,start:\d+\.\d", all_issues_db;dur=\d+\.\d;desc="calls:2,start:\d+\.\d", all_json;dur=\d+\.\d;desc="calls:1,start:\d+\.\d"$/);
    expect(metadata).not.toMatch(/private|document|database|token/i);
  });

  it("does not log operation output or exceptions", async () => {
    const log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error");
    try {
      const timing = createAllStartupTiming({ headers: new Headers({ "x-minddy-performance-diagnostic": "all-startup-v1" }) })!;
      await timing.span("issues_decode", async () => ({ content: "Private content" }));
      expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    } finally { log.mockRestore(); error.mockRestore(); }
  });
});
