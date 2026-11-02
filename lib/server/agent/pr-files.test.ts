import { afterEach, describe, expect, it, vi } from "vitest";

import { listPullRequestFiles } from "./pr";

/**
 * Pagination of files in a PR (MIN-168).
 *
 * The call only served ONE page — `per_page=100`, without `page` — and said nothing about it: beyond a hundred files, the following ones disappeared without leaving a trace, and the caller could not even know that they were missing. On a rereading, this is exactly the kind of absence from which one draws a false conclusion. Hence the two halves tested here: we WILL SEARCH the following pages,
 * and we SAY when we stop at the ceiling.
 */

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

/** A GitHub response of `n` files, named after their page. */
function page(n: number, tag: string) {
  return Array.from({ length: n }, (_, i) => ({
    filename: `${tag}/file-${i}.ts`,
    status: "modified",
    additions: 1,
    deletions: 0,
    patch: "@@ -1 +1 @@\n+x",
  }));
}

/** A fake `fetch` that serves pages in order and notes the requested URLs. */
function stubPages(pages: unknown[][]) {
  const urls: string[] = [];
  globalThis.fetch = vi.fn(async (url: unknown) => {
    urls.push(String(url));
    const asked = Number(new URL(String(url)).searchParams.get("page") ?? "1");
    const body = pages[asked - 1] ?? [];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return urls;
}

const CALL = { token: "t", repoFullName: "acme/app", number: 7 };

describe("listPullRequestFiles", () => {
  it("stops at the first incomplete page", async () => {
    const urls = stubPages([page(100, "p1"), page(12, "p2")]);
    const { files, truncated } = await listPullRequestFiles(CALL);
    expect(files).toHaveLength(112);
    expect(truncated).toBe(false);
    // Once page 1 is full, the next pages are read together.
    expect(urls).toHaveLength(5);
    expect(urls[0]).toContain("per_page=100&page=1");
    expect(urls[1]).toContain("per_page=100&page=2");
  });

  it("reads the pages after the first together", async () => {
    let inFlight = 0;
    let most = 0;
    const pages = [page(100, "p1"), page(100, "p2"), page(100, "p3"), page(7, "p4")];
    globalThis.fetch = vi.fn(async (url: unknown) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      const asked = Number(new URL(String(url)).searchParams.get("page"));
      return Response.json(pages[asked - 1] ?? []);
    }) as unknown as typeof fetch;
    const { files, truncated } = await listPullRequestFiles(CALL);
    expect(files.map((f) => f.filename.split("/")[0])).toEqual([
      ...Array(100).fill("p1"), ...Array(100).fill("p2"), ...Array(100).fill("p3"), ...Array(7).fill("p4"),
    ]);
    expect(truncated).toBe(false);
    expect(most).toBe(4);
  });

  it("makes a single call when the PR fits on one page", async () => {
    const urls = stubPages([page(3, "p1")]);
    const { files, truncated } = await listPullRequestFiles(CALL);
    expect(files).toHaveLength(3);
    expect(truncated).toBe(false);
    expect(urls).toHaveLength(1);
  });

  it("SAYS it truncated when the page ceiling cuts the list", async () => {
    // All full pages: the terminal (30 pages × 100) ends up deciding.
    const urls = stubPages(Array.from({ length: 40 }, (_, i) => page(100, `p${i}`)));
    const { files, truncated } = await listPullRequestFiles(CALL);
    expect(files).toHaveLength(3000);
    expect(truncated).toBe(true);
    expect(urls).toHaveLength(30);
  });

  it("keeps the BEFORE path of a renamed file", async () => {
    stubPages([
      [
        {
          filename: "lib/new.ts",
          previous_filename: "lib/old.ts",
          status: "renamed",
          additions: 1,
          deletions: 1,
        },
      ],
    ]);
    const { files } = await listPullRequestFiles(CALL);
    expect(files[0]).toMatchObject({
      filename: "lib/new.ts",
      previous_filename: "lib/old.ts",
    });
  });
});
