import assert from "node:assert/strict";
import test from "node:test";
import { categoryIndexes, validateFixtureIssues } from "./enrich-categories.mjs";
import { id, workload } from "./seed.mjs";

test("category fixture covers mixed cardinalities and every category", () => {
  const counts = [0, 0, 0, 0];
  const categories = new Set();
  for (let index = 0; index < 100; index++) {
    const tags = categoryIndexes(index);
    assert.equal(new Set(tags).size, tags.length);
    counts[tags.length]++;
    tags.forEach((tag) => categories.add(tag));
  }
  assert.deepEqual(counts, [20, 40, 30, 10]);
  assert.equal(categories.size, 6);
});

test("category enrichment refuses incomplete, duplicate, foreign or connected issues", () => {
  const rows = workload("fixture-owner").issues.filter((row) => row.project_id === id("project-0"));
  validateFixtureIssues(rows, 0, "fixture-owner");
  assert.throws(() => validateFixtureIssues(rows.slice(1), 0, "fixture-owner"));
  assert.throws(() => validateFixtureIssues([rows[0], ...rows.slice(0, -1)], 0, "fixture-owner"));
  for (const patch of [{ project_id: id("project-1") }, { created_by: "other-owner" }, { remote_provider: "github" }]) {
    assert.throws(() => validateFixtureIssues([{ ...rows[0], ...patch }, ...rows.slice(1)], 0, "fixture-owner"));
  }
});
