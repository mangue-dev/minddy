import { describe, expect, it } from "vitest";
import { parsePatchFiles } from "@pierre/diffs";
import { pullRequestDiffCacheKey } from "@/lib/pr-diff-cache";

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
});
