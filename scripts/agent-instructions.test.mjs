import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Codex reads AGENTS.md and Claude Code reads CLAUDE.md; both must get the
// same rules. `next dev` rewrites its managed block in only one of them, so
// this also catches a Next.js upgrade that changes that block.
test("AGENTS.md and CLAUDE.md are identical", () => {
  const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(read("CLAUDE.md"), read("AGENTS.md"),
    "AGENTS.md and CLAUDE.md differ: apply the same edit to both files.");
});
