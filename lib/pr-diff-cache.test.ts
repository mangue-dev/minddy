import { describe, expect, it } from "vitest";
import { parsePatchFiles } from "@pierre/diffs";
import {
  pullRequestDiffCacheKey,
  pullRequestHydratedDiffCacheKey,
} from "@/lib/pr-diff-cache";

const patch = (line: string) => `diff --git a/example.ts b/example.ts
--- a/example.ts
+++ b/example.ts
@@ -1 +1 @@
-old
+${line}
`;

describe("pullRequestDiffCacheKey", () => {
  it("is stable for unchanged patches and changes with their content", () => {
    expect(pullRequestDiffCacheKey(patch("new"))).toBe(
      pullRequestDiffCacheKey(patch("new")),
    );
    expect(pullRequestDiffCacheKey(patch("new"))).not.toBe(
      pullRequestDiffCacheKey(patch("newer")),
    );
  });

  it("gives pierre-diffs a fresh file cache key after a same-path refresh", () => {
    const firstPatch = patch("new");
    const refreshedPatch = patch("newer");
    const first = parsePatchFiles(
      firstPatch,
      pullRequestDiffCacheKey(firstPatch),
    )[0].files[0];
    const refreshed = parsePatchFiles(
      refreshedPatch,
      pullRequestDiffCacheKey(refreshedPatch),
    )[0].files[0];

    expect(first.name).toBe(refreshed.name);
    expect(first.cacheKey).not.toBe(refreshed.cacheKey);
  });

  it("isolates different review hunks that point to the same path", () => {
    const reviewHunk = (marker: string) => `diff --git a/example.ts b/example.ts
--- a/example.ts
+++ b/example.ts
@@ -1,2 +1,2 @@
-old
+${marker}
 context
`;
    const firstPatch = reviewHunk("first");
    const secondPatch = reviewHunk("second");
    const first = parsePatchFiles(firstPatch, pullRequestDiffCacheKey(firstPatch))[0].files[0];
    const second = parsePatchFiles(secondPatch, pullRequestDiffCacheKey(secondPatch))[0].files[0];

    expect(first.name).toBe(second.name);
    expect(first.cacheKey).not.toBe(second.cacheKey);
  });

  it("changes the hydrated identity when either complete file side changes", () => {
    const first = pullRequestHydratedDiffCacheKey(
      "example.ts",
      "old contents",
      "example.ts",
      "first contents",
    );
    const second = pullRequestHydratedDiffCacheKey(
      "example.ts",
      "old contents",
      "example.ts",
      "second contents",
    );

    expect(first).not.toBe(second);
    expect(first).toBe(
      pullRequestHydratedDiffCacheKey(
        "example.ts",
        "old contents",
        "example.ts",
        "first contents",
      ),
    );
  });
});
