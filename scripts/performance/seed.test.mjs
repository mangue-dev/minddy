import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertRepositoryScope, assertScope, id, workload } from "./seed.mjs";

const user = "fixture-owner";
const fixture = workload(user);

test("the workload is deterministic, representative, and entirely fixture-scoped", () => {
  assert.deepEqual(workload(user), fixture);
  assert.equal(fixture.projects.length, 6);
  assert.equal(fixture.issues.length, 600);
  assert.equal(fixture.pages.length, 120);
  assert.equal(fixture.comments.length, 1_200);
  assert.equal(fixture.page_comments.length, 480);
  assert.equal(fixture.pull_requests.length, 180);
  const allIds = [];
  for (const [table, rows] of Object.entries(fixture)) {
    for (const row of rows) {
      assertScope(table, row, user);
      allIds.push(row.id);
    }
  }
  assert.equal(new Set(allIds).size, allIds.length);
  assert.ok(allIds.every((value) => /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}$/.test(value)));
  assert.ok(fixture.pages.every((page) => page.content.content.length === 80));
});

test("foreign ownership and foreign parent resources are rejected", () => {
  for (const [table, field, row] of [
    ["projects", "owner_id", fixture.projects[0]],
    ["issues", "assignee_id", fixture.issues[0]],
    ["issues", "project_id", fixture.issues[0]],
    ["comments", "author_id", fixture.comments[0]],
    ["comments", "issue_id", fixture.comments[0]],
    ["page_comments", "page_id", fixture.page_comments[0]],
    ["pull_requests", "repo_full_name", fixture.pull_requests[0]],
  ]) {
    assert.throws(() => assertScope(table, { ...row, [field]: "foreign" }, user), /Foreign/);
  }
});

test("reused projects and issues cannot enable paid automation or forge effects", () => {
  for (const field of ["automations_enabled", "smart_assign_enabled", "auto_assign_enabled"]) {
    assert.throws(() => assertScope("projects", { ...fixture.projects[0], [field]: true }, user), /automations disabled/);
  }
  for (const field of ["automation_override", "remote_provider", "remote_repo_id", "remote_number", "integration_id"]) {
    assert.throws(() => assertScope("issues", { ...fixture.issues[0], [field]: "enabled" }, user), /must not carry/);
  }
});

test("fixture connections cannot retain credentials from a prior manual setup", () => {
  for (const field of ["access_token_encrypted", "refresh_token_encrypted", "installation_id"]) {
    assert.throws(() => assertScope("git_connections", { ...fixture.git_connections[0], [field]: "credential" }, user), /no credentials/);
  }
  assert.throws(() => assertScope("git_connections", { ...fixture.git_connections[0], provider: "gitlab" }, user), /Foreign fixture connection/);
});

test("fixture repository links cannot resolve real forge repositories or credentials", () => {
  for (const [field, value] of [
    ["connection_id", "foreign-connection"],
    ["external_repo_id", "12345"],
    ["repo_full_name", fixture.project_git_links[1].repo_full_name],
    ["project_id", fixture.projects[1].id],
  ]) {
    assert.throws(() => assertScope("project_git_links", { ...fixture.project_git_links[0], [field]: value }, user), /Foreign/);
  }
  for (const [field, value] of [["installation_id", 123], ["webhook_secret_encrypted", "secret"], ["issue_sync_enabled", true]]) {
    assert.throws(() => assertScope("project_git_links", { ...fixture.project_git_links[0], [field]: value }, user), /no credentials or synchronization/);
  }
});

test("global sync stamps require every matching repository link to belong to the fixture", async () => {
  const calls = [];
  let rows = fixture.project_git_links;
  const query = {
    select(value) { calls.push(["select", value]); return this; },
    eq(field, value) { calls.push(["eq", field, value]); return this; },
    in(field, values) { calls.push(["in", field, values]); return { data: rows, error: null }; },
  };
  const admin = { from(table) { calls.push(["from", table]); return query; } };
  await assertRepositoryScope(admin, user);
  assert.deepEqual(calls[0], ["from", "project_git_links"]);
  assert.deepEqual(calls[2], ["eq", "provider", "github"]);
  assert.deepEqual(calls[3], ["in", "repo_full_name", fixture.project_git_links.map((link) => link.repo_full_name)]);
  rows = [...rows, { ...rows[0], project_id: id("foreign-project") }];
  await assert.rejects(assertRepositoryScope(admin, user), /Foreign project/);
});

test("the default dry run works without environment credentials or a repository cwd", () => {
  const stdout = execFileSync(process.execPath, [fileURLToPath(new URL("./seed.mjs", import.meta.url))], {
    cwd: tmpdir(),
    env: {},
    encoding: "utf8",
  });
  assert.match(stdout, /600 issues/);
  assert.match(stdout, /Pass --apply/);
});
