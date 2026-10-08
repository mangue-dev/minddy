import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { documentationLocales } from "../lib/documentation-core.mjs";

const directories = [];
afterEach(() => { while (directories.length) rmSync(directories.pop(), { recursive: true, force: true }); });
function fixture(transform = article => article, content = "## Start {#start}\n\nRead the complete task.\n") {
  const root = mkdtempSync(path.join(tmpdir(), "minddy-documentation-check-"));
  directories.push(root);
  mkdirSync(path.join(root, "docs/plans"), { recursive: true });
  writeFileSync(path.join(root, "docs/plans/min-664-coverage.md"), "| S01 `guide` | Task |\n");
  writeFileSync(path.join(root, "source.txt"), "Verified test fixture.\n");
  mkdirSync(path.join(root, "content/documentation"), { recursive: true });
  writeFileSync(path.join(root, "content/documentation/coverage.json"), JSON.stringify([{ workflow: "S01", article: "guide", section: "start", requiresFigures: false }]));
  for (const locale of documentationLocales) {
    const directory = path.join(root, "content/documentation", locale);
    mkdirSync(directory);
    const article = transform({ id: "guide", locale, title: "Task", summary: "Complete a task.", topic: "Work", type: "guide", audiences: ["member"], workflows: ["S01"], visibility: "public", status: "published", revision: 1, sourceRevision: 1, owner: "@maintainer", updatedAt: "2026-10-08", compatibility: { version: "test fixture", editions: ["Cloud"], profiles: ["web"], evidence: ["source.txt"] }, review: { revision: 1, fact: "Agent test fixture", language: "Agent test fixture", date: "2026-10-08" }, related: [], aliases: [], tags: [], figures: [], requiredFigures: [] });
    writeFileSync(path.join(directory, "guide.md"), `---\n${JSON.stringify(article)}\n---\n${content}`);
  }
  return root;
}
function check(root, release = true) {
  const result = spawnSync(process.execPath, ["scripts/documentation-check.mjs", "--root", root, ...(release ? ["--release"] : [])], { encoding: "utf8" });
  return { status: result.status, output: result.stdout + result.stderr };
}

test("a coherent release set passes and a draft check does not imply release acceptance", () => {
  assert.equal(check(fixture()).status, 0);
  const drafts = fixture(article => ({ ...article, status: "draft", review: { revision: 1, fact: null, language: null, date: null } }));
  assert.equal(check(drafts, false).status, 0);
  assert.notEqual(check(drafts).status, 0);
});
test("reference-style links and anchors are checked with the Markdown parser", () => {
  const root = fixture(undefined, "## Start {#start}\n\nRead [the task][task].\n\n[task]: /docs/guide#missing\n");
  assert.match(check(root).output, /missing anchor/);
});
test("code examples do not create false links or headings", () => {
  const root = fixture(undefined, "## Start {#start}\n\n```md\n## Not a heading\n[private](/secret)\n```\n");
  assert.equal(check(root).status, 0);
});
test("empty metadata, invalid dates and stale translations block publication", () => {
  const root = fixture(article => article.locale === "fr" ? { ...article, title: " ", sourceRevision: 0, review: { ...article.review, date: "2026-02-31" } } : article);
  const result = check(root);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /empty title/);
  assert.match(result.output, /stale translation revision/);
});
test("private links and missing required locale images block release", () => {
  const root = fixture(article => ({ ...article, requiredFigures: ["steps"] }), "## Start {#start}\n\n[Private](/share/secret) and ![steps][image].\n\n[image]: /documentation/en/missing.png\n");
  const result = check(root);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /unresolved local link/);
  assert.match(result.output, /unregistered image/);
});


test("translations preserve publication identities and operating conditions", () => {
  const root = fixture(article => article.locale === "de" ? { ...article, aliases: ["retired-guide"], audiences: ["operator"], compatibility: { ...article.compatibility, profiles: ["desktop"] } } : article);
  const result = check(root);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /aliases parity differs/);
  assert.match(result.output, /audiences parity differs/);
  assert.match(result.output, /compatibility parity differs/);
});
