import { describe, expect, it } from "vitest";

import {
  mergeAgentLocalDiff,
  parseAgentLocalDiff,
  selectAgentSessionDiff,
  settledAgentLocalDiff,
} from "./agent-local-diff";
import { DESKTOP_LOCAL_DIFF_PATCH_CAP } from "./desktop/local-run-diff";
import type { AgentRunEvent } from "./agent-api";

function event(seq: number, diff: unknown): AgentRunEvent {
  return {
    id: `e${seq}`,
    seq,
    type: "files_changed",
    payload: { diff },
    created_at: new Date(seq).toISOString(),
  };
}

describe("a run's local diff", () => {
  it("validates the shape before giving it to the renderer", () => {
    expect(parseAgentLocalDiff({
      files: [
        { filename: "lib/a.ts", status: "modified", additions: 2.6, deletions: -1, patch: "@@\n+x" },
        { filename: "", patch: "ignoré" },
        { filename: "b.ts", status: "cosmique", additions: "4" },
      ],
    })).toEqual({
      files: [
        { filename: "lib/a.ts", status: "modified", additions: 3, deletions: 0, patch: "@@\n+x" },
        { filename: "b.ts", status: "modified", additions: 0, deletions: 0 },
      ],
      truncated: false,
    });
  });

  it("allows the desktop reader to retain a larger on-demand patch", () => {
    const patch = "x".repeat(300_000);
    expect(parseAgentLocalDiff({
      files: [{ filename: "large.ts", patch }],
    }).files[0]?.patch).toHaveLength(240_000);
    expect(parseAgentLocalDiff({
      files: [{ filename: "large.ts", patch }],
    }, { patchCap: DESKTOP_LOCAL_DIFF_PATCH_CAP }).files[0]?.patch).toHaveLength(300_000);
  });

  it("keeps the latest patch for a file edited across several turns", () => {
    const settled = settledAgentLocalDiff([
      event(1, { files: [{ filename: "a.ts", status: "modified", additions: 1, deletions: 0, patch: "ancien" }] }),
      event(2, { files: [{ filename: "b.ts", status: "added", additions: 2, deletions: 0, patch: "b" }] }),
      event(3, { files: [{ filename: "a.ts", status: "modified", additions: 3, deletions: 1, patch: "nouveau" }] }),
    ]);

    expect(settled.files.map((file) => [file.filename, file.patch])).toEqual([
      ["a.ts", "nouveau"],
      ["b.ts", "b"],
    ]);
  });

  it("lets the live snapshot override persisted events", () => {
    const merged = mergeAgentLocalDiff(
      { files: [{ filename: "a.ts", status: "modified", additions: 1, deletions: 0, patch: "settled" }], truncated: false },
      { files: [{ filename: "a.ts", status: "modified", additions: 2, deletions: 0, patch: "live" }], truncated: true },
    );
    expect(merged.files[0]?.patch).toBe("live");
    expect(merged.truncated).toBe(true);
  });

  it("an empty snapshot removes an old diff after changes are cancelled", () => {
    const settled = settledAgentLocalDiff([
      event(1, { files: [{ filename: "a.ts", status: "modified", additions: 1, deletions: 0, patch: "avant" }] }),
      event(2, { files: [], snapshot: true }),
    ]);
    expect(settled.files).toEqual([]);
    expect(mergeAgentLocalDiff(
      { files: [{ filename: "a.ts", status: "modified", additions: 1, deletions: 0 }], truncated: false },
      { files: [], truncated: false, snapshot: true },
    ).files).toEqual([]);
  });

  it("does not resurrect historical files after an authoritative empty response", () => {
    expect(selectAgentSessionDiff({
      local: false,
      localDiff: { files: [], truncated: false },
      remoteFiles: [],
      remoteReady: true,
      fallbackFiles: [
        { path: "stale.ts", status: "modified", additions: 2, deletions: 1 },
      ],
    })).toEqual([]);
  });

  it("uses the attributed local patch instead of working-tree fallback files", () => {
    expect(selectAgentSessionDiff({
      local: true,
      localDiff: {
        files: [
          { filename: "owned.ts", status: "modified", additions: 1, deletions: 0 },
        ],
        truncated: false,
      },
      remoteFiles: [],
      remoteReady: false,
      fallbackFiles: [
        { path: "user-wip.ts", status: "modified", additions: 9, deletions: 4 },
      ],
    }).map((file) => file.filename)).toEqual(["owned.ts"]);
  });
});
