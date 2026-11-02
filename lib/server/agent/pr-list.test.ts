import { afterEach, describe, expect, it, vi } from "vitest";

import { listPullRequests } from "./pr";

/**
 * The repository listing behind sweeps and the review queue (MIN-889). A full
 * listing reads up to five pages one after another, several seconds a
 * repository; sweeps and the review queue need much less.
 */

afterEach(() => vi.unstubAllGlobals());

function pull(number: number, updatedAt: string) {
  return {
    number, html_url: `https://github.com/acme/app/pull/${number}`, state: "open",
    head: { ref: `b${number}`, sha: `s${number}` }, base: { ref: "main" }, updated_at: updatedAt,
  };
}

function stubPages(pages: unknown[][]) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    urls.push(String(url));
    const page = Number(new URL(String(url)).searchParams.get("page"));
    return Response.json(pages[page - 1] ?? []);
  }));
  return urls;
}

const CALL = { token: "t", repoFullName: "acme/app" };

describe("listPullRequests", () => {
  it("stops at the first PR older than the window", async () => {
    const full = Array.from({ length: 20 }, (_, i) =>
      pull(500 - i, i < 3 ? "2026-11-02T12:00:00Z" : "2026-10-01T00:00:00Z"));
    const urls = stubPages([full, full]);
    const { pulls, truncated } = await listPullRequests({ ...CALL, updatedSince: "2026-11-02T11:00:00Z" });
    expect(pulls.map((pr) => pr.number)).toEqual([500, 499, 498]);
    expect(truncated).toBe(false);
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).searchParams.get("per_page")).toBe("20");
  });

  it("keeps reading small pages while the window goes on", async () => {
    const recent = Array.from({ length: 20 }, (_, i) => pull(500 - i, "2026-11-02T12:00:00Z"));
    const urls = stubPages([recent, [pull(1, "2026-11-02T12:00:00Z"), pull(0, "2026-10-01T00:00:00Z")]]);
    const { pulls } = await listPullRequests({ ...CALL, updatedSince: "2026-11-02T11:00:00Z" });
    expect(pulls).toHaveLength(21);
    expect(urls).toHaveLength(2);
  });

  it("asks only for open PRs when told so", async () => {
    const urls = stubPages([[pull(1, "2026-11-02T12:00:00Z")]]);
    await listPullRequests({ ...CALL, state: "open" });
    expect(new URL(urls[0]).searchParams.get("state")).toBe("open");
  });

  it("reads every state through the page ceiling by default", async () => {
    const full = Array.from({ length: 100 }, (_, i) => pull(i, "2026-10-01T00:00:00Z"));
    const urls = stubPages(Array.from({ length: 6 }, () => full));
    const { truncated } = await listPullRequests(CALL);
    expect(new URL(urls[0]).searchParams.get("state")).toBe("all");
    expect(urls).toHaveLength(5);
    expect(truncated).toBe(true);
  });
});
