import { describe, expect, it } from "vitest";

import { pullRequestStateFromRef, pullRequestStateToPropagate } from "./pr-state";

/**
 * `pullRequestStateFromRef` — what the forge GET says → the four minddy
 * words. Client twin of `prStateFromRef` (lib/server/agent/pull-requests.ts):
 * it feeds the live propagation of the open panel into the sidebar list, so
 * the two must never diverge or a merge confirmed on the server would be
 * repainted "open" by the panel a second later.
 *
 * ORDER is all it asserts, in two sentences: merged trumps closed, and a
 * draft is only a draft as long as it is open.
 */

const ref = (
  over: {
    state?: string;
    draft?: boolean | null;
    merged?: boolean | null;
  } = {},
) => ({ state: "open", draft: false, merged: false, ...over });

describe("pullRequestStateFromRef", () => {
  it("merged wins over closed — both forges close a PR by merging it", () => {
    expect(pullRequestStateFromRef(ref({ state: "closed", merged: true }))).toBe(
      "merged",
    );
    expect(pullRequestStateFromRef(ref({ state: "closed" }))).toBe("closed");
  });

  it("a draft is only a draft as long as it is OPEN", () => {
    expect(pullRequestStateFromRef(ref({ draft: true }))).toBe("draft");
    // GitHub does not drop `draft` when closing: calling it "draft" would
    // hide that it is dead. Same for a merged draft (rare, but authorized).
    expect(pullRequestStateFromRef(ref({ state: "closed", draft: true }))).toBe(
      "closed",
    );
    expect(
      pullRequestStateFromRef(ref({ state: "closed", draft: true, merged: true })),
    ).toBe("merged");
  });

  it("everything else is open — `locked` included", () => {
    expect(pullRequestStateFromRef(ref())).toBe("open");
    expect(pullRequestStateFromRef(ref({ draft: false, merged: false }))).toBe(
      "open",
    );
  });
});

describe("pullRequestStateToPropagate", () => {
  // The list carries the state minddy last wrote; the panel carries the
  // forge's GET it just reread.
  const item = { pr_state: "open" as const, updated_at: "2026-09-01T10:00:00Z" };

  it("a FRESHER observation disagrees with the list → propagate it", () => {
    // A merge landed in the background (“Generate then merge”) or on the
    // forge: the panel reread it, the list cache did not yet.
    expect(
      pullRequestStateToPropagate(
        { state: "closed", merged: true, updatedAt: "2026-09-01T11:00:00Z" },
        item,
      ),
    ).toBe("merged");
    expect(
      pullRequestStateToPropagate(
        { state: "closed", updatedAt: "2026-09-01T11:00:00Z" },
        item,
      ),
    ).toBe("closed");
    // A draft that went ready for review while the page was open.
    expect(
      pullRequestStateToPropagate(
        { state: "open", draft: false, updatedAt: "2026-09-01T11:00:00Z" },
        { pr_state: "draft", updated_at: "2026-09-01T10:00:00Z" },
      ),
    ).toBe("open");
  });

  it("a STALE observation never rolls a fresh state back", () => {
    // The GET left before the in-app merge and lands after it: the forge
    // still says “open” while the list already says “merged”.
    expect(
      pullRequestStateToPropagate(
        { state: "open", draft: false, updatedAt: "2026-08-31T09:00:00Z" },
        { pr_state: "merged", updated_at: "2026-09-01T10:00:00Z" },
      ),
    ).toBeNull();
    // Same observation as the list's (equal timestamps): nothing to order
    // by, nothing to move.
    expect(
      pullRequestStateToPropagate(
        { state: "closed", updatedAt: "2026-09-01T10:00:00Z" },
        { pr_state: "merged", updated_at: "2026-09-01T10:00:00Z" },
      ),
    ).toBeNull();
  });

  it("an observation without a forge timestamp is not orderable — keep the list", () => {
    expect(
      pullRequestStateToPropagate({ state: "closed", merged: true }, item),
    ).toBeNull();
    expect(
      pullRequestStateToPropagate(
        { state: "closed", updatedAt: "not a date" },
        item,
      ),
    ).toBeNull();
  });

  it("a GET received before the panel's own write says nothing about it", () => {
    // The click stamped the panel before the in-flight GET came back: even a
    // “newer” forge timestamp on it must not override the click.
    expect(
      pullRequestStateToPropagate(
        { state: "open", draft: false, updatedAt: "2026-09-01T11:00:00Z" },
        { pr_state: "merged", updated_at: "2026-09-01T10:00:00Z" },
        { fetchedAt: 1_000, notBefore: 2_000 },
      ),
    ).toBeNull();
    // A GET received AFTER the write is allowed to speak again.
    expect(
      pullRequestStateToPropagate(
        { state: "open", draft: false, updatedAt: "2026-09-01T11:00:00Z" },
        { pr_state: "draft", updated_at: "2026-09-01T10:00:00Z" },
        { fetchedAt: 3_000, notBefore: 2_000 },
      ),
    ).toBe("open");
    // No local write yet (`notBefore` 0): any GET may speak.
    expect(
      pullRequestStateToPropagate(
        { state: "closed", merged: true, updatedAt: "2026-09-01T11:00:00Z" },
        item,
        { fetchedAt: 5_000 },
      ),
    ).toBe("merged");
  });

  it("an agreeing state says nothing, whatever the dates", () => {
    expect(
      pullRequestStateToPropagate(
        { state: "open", draft: false, updatedAt: "2026-09-01T11:00:00Z" },
        item,
      ),
    ).toBeNull();
  });
});
