import { describe, expect, it } from "vitest";

import {
  mergeAgentLocalDiff,
  parseAgentLocalDiff,
  settledAgentLocalDiff,
} from "./agent-local-diff";
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

describe("diff local d'un run", () => {
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

  it("garde le dernier patch d'un fichier retouché sur plusieurs tours", () => {
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

  it("fait gagner l'instantané live sur les events persistés", () => {
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
});
