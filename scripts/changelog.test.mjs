import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CHANGELOG_LOCALES, validateDraft, validateRelease, validateIndex, toIndexEntry, isSupportedChangelogVersion } from "./changelog-lib.mjs";
import { publishRelease, createStorage } from "./changelog-publish.mjs";
const read = file => JSON.parse(readFileSync(new URL(`../content/changelog/${file}`, import.meta.url), "utf8"));
const seed = read("releases/0.11.0.json");
const draft = () => {
  const { publishedAt, sha, deploymentId, ...value } = structuredClone(seed);
  value.version = "0.12.0";
  value.features.forEach(f => { f.id = `new-${f.id}`; });
  return value;
};
const sha = "a".repeat(40);
const proof = { sha, deploymentId: 123, state: "success", environment: "Production", publishedAt: "2026-10-03T12:00:00Z" };

test("historical migration retains every feature since 0.11.0 and preserves its translations", () => {
  const index = validateIndex(read("index.json"));
  const legacy = read("legacy.json");
  const releases = index.map(r => validateRelease(read(`releases/${r.version}.json`)));
  const features = releases.flatMap(r => r.features);
  const evidence = read("backfill-evidence.json");
  const retainedIds = new Set(evidence.mappings.filter(m => isSupportedChangelogVersion(m.version)).map(m => m.id));
  assert.deepEqual(index.map(r => r.version), ["0.11.0"]);
  assert.equal(features.length, retainedIds.size);
  assert.equal(new Set(features.map(f => f.id)).size, retainedIds.size);
  for (const original of legacy.filter(f => retainedIds.has(f.id))) {
    const feature = features.find(f => f.id === original.id);
    for (const locale of CHANGELOG_LOCALES) {
      assert.equal(feature.copy[locale].title, original.copy[locale].title);
      assert.ok(feature.copy[locale].details.includes(original.copy[locale].body));
    }
  }
  assert.equal(read("backfill-report.json").excludedCount, legacy.length - retainedIds.size);
  assert.equal(read("backfill-report.json").uncertainties.length, 0);
});

test("backfill is deterministic and safe to rerun", () => {
  const output = execFileSync(process.execPath, ["scripts/changelog-backfill.mjs", "--dry-run"], {
    encoding: "utf8",
    // A small clone or a developer's preference must not alter binary fingerprints.
    env: { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.abbrev", GIT_CONFIG_VALUE_0: "4" },
  });
  assert.match(output, /63\/63 features/);
  assert.match(output, /0 changed files/);
});

test("backfill reruns without rewritten Git objects and rejects inconsistent recorded evidence", () => {
  const root = mkdtempSync(path.join(tmpdir(), "minddy-changelog-"));
  try {
    mkdirSync(path.join(root, "scripts"));
    for (const name of ["changelog-backfill.mjs", "changelog-lib.mjs"]) {
      cpSync(new URL(name, import.meta.url), path.join(root, "scripts", name));
    }
    cpSync(new URL("../content/changelog", import.meta.url), path.join(root, "content/changelog"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: root });
    const run = (...args) => execFileSync(process.execPath, ["scripts/changelog-backfill.mjs", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.match(run("--dry-run"), /0 changed files/);
    assert.match(run(), /0 changed files/);
    // A stale local release must be removed by regeneration and stay excluded on reruns.
    const obsolete = path.join(root, "content/changelog/releases/0.10.0.json");
    writeFileSync(obsolete, "{}");
    assert.match(run("--dry-run"), /1 changed files/);
    assert.match(run(), /1 changed files/);
    assert.match(run(), /0 changed files/);
    assert.throws(() => run("--verify-git"), /Historical Git objects are unavailable/);
    const file = path.join(root, "content/changelog/backfill-evidence.json");
    const evidence = JSON.parse(readFileSync(file, "utf8"));
    evidence.mappings[0].sourceStablePatchId = "0".repeat(40);
    writeFileSync(file, JSON.stringify(evidence));
    assert.throws(run, /Unverified historical mapping/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the public version cutoff uses numeric SemVer components", () => {
  for (const version of ["0.11.0", "0.11.1", "0.100.0", "1.0.0"]) assert.equal(isSupportedChangelogVersion(version), true);
  for (const version of ["0.9.99", "0.10.100", "0.11.0-beta", "invalid"]) assert.equal(isSupportedChangelogVersion(version), false);
});

test("publication removes obsolete index entries and cannot reintroduce old versions", async () => {
  const old = structuredClone(seed);
  old.version = "0.10.0"; old.publishedAt = "2026-09-01T12:00:00Z";
  old.features.forEach(f => { f.id = `old-${f.id}`; });
  const uploads = [];
  const result = await publishRelease({ draft: draft(), sha, proof, index: [toIndexEntry(seed), toIndexEntry(old)], upload: async (...args) => uploads.push(args) });
  assert.deepEqual(result.index.map(r => r.version), ["0.12.0", "0.11.0"]);
  assert.deepEqual(uploads[1][1], result.index);
  await assert.rejects(publishRelease({ draft: { ...draft(), version: "0.10.1" }, sha, proof, index: [], upload: async () => {} }), /predates/);
});

test("drafts reject missing locales, bundled images, invalid dates, and oversized content", () => {
  const missing = draft(); delete missing.copy.fr;
  assert.throws(() => validateDraft(missing), /six supported locales/);
  const image = draft(); image.features[0].illustration = { kind: "image", url: "/bundled.png", width: 400, height: 300 };
  assert.throws(() => validateDraft(image));
  const details = draft(); details.features[0].copy.en.details = ["x".repeat(1201)];
  assert.throws(() => validateDraft(details), /1200/);
  assert.throws(() => validateRelease({ ...draft(), sha, deploymentId: 123, publishedAt: "invalid" }), /timestamp/);
  const extra = draft(); extra.copy.en.internalNotes = "Private issue text";
  assert.throws(() => validateDraft(extra), /unknown fields/);
});

test("a failed or preview deployment cannot publish anything", async () => {
  for (const altered of [{ ...proof, state: "failure" }, { ...proof, environment: "Preview" }, { ...proof, sha: "b".repeat(40) }]) {
    const uploads = [];
    await assert.rejects(publishRelease({ draft: draft(), sha, proof: altered, index: [], upload: async (...args) => uploads.push(args) }));
    assert.equal(uploads.length, 0);
  }
});

test("publication uploads release content before advancing the index", async () => {
  const uploads = [];
  const result = await publishRelease({ draft: draft(), sha, proof, index: [], upload: async (...args) => uploads.push(args) });
  assert.deepEqual(uploads.map(u => u[0]), ["releases/0.12.0.json", "index.json"]);
  assert.equal(result.index[0].publishedAt, proof.publishedAt);
  assert.equal(result.index[0].sha, sha);
  assert.equal(result.published, true);
});

test("a partial content upload failure does not advance the index", async () => {
  const uploads = [];
  await assert.rejects(publishRelease({ draft: draft(), sha, proof, index: [], upload: async file => {
    uploads.push(file); throw new Error("Storage unavailable");
  } }), /Storage unavailable/);
  assert.deepEqual(uploads, ["releases/0.12.0.json"]);
});

test("retries and same-version redeployments preserve the original entry", async () => {
  const release = { ...draft(), sha, publishedAt: proof.publishedAt, deploymentId: proof.deploymentId };
  const index = [toIndexEntry(release)];
  const uploads = [];
  const result = await publishRelease({ draft: { ...draft(), copy: { ...draft().copy, en: { title: "Changed", summary: "Changed" } } },
    sha, proof: { ...proof, deploymentId: 456, publishedAt: "2026-10-04T12:00:00Z" }, index, upload: async file => uploads.push(file) });
  assert.equal(result.published, false);
  assert.deepEqual(result.index, index);
  assert.deepEqual(uploads, []);
});

test("a retry verifies an immutable object left behind by an interrupted publication", async () => {
  const value = { version: "0.12.0" };
  const calls = [];
  const storage = createStorage({ base: "https://storage.example.test", token: "test" }, async (url, options) => {
    calls.push(options.method ?? "GET");
    return options.method === "POST" ? new Response("exists", { status: 409 }) : Response.json(value);
  });
  await storage.upload("releases/0.12.0.json", value, false);
  assert.deepEqual(calls, ["POST", "GET"]);
  await assert.rejects(storage.upload("releases/0.12.0.json", { version: "0.13.0" }, false), /Cannot upload/);
});


test("the storage API's wrapped not-found responses are safe during first publication", async () => {
  const storage = createStorage({ base: "https://storage.example.test", token: "test" }, async () =>
    Response.json({ statusCode: "404", error: "not_found", message: "Object not found" }, { status: 400 }));
  assert.equal(await storage.index(), null);
});
