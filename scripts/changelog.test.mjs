import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { CHANGELOG_LOCALES, validateDraft, validateRelease, validateIndex, toIndexEntry } from "./changelog-lib.mjs";
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

test("historical migration preserves every feature and translation exactly once", () => {
  const index = validateIndex(read("index.json"));
  const legacy = read("legacy.json");
  const releases = index.map(r => validateRelease(read(`releases/${r.version}.json`)));
  const features = releases.flatMap(r => r.features);
  assert.equal(features.length, legacy.length);
  assert.equal(new Set(features.map(f => f.id)).size, legacy.length);
  for (const original of legacy) {
    const feature = features.find(f => f.id === original.id);
    for (const locale of CHANGELOG_LOCALES) {
      assert.equal(feature.copy[locale].title, original.copy[locale].title);
      assert.ok(feature.copy[locale].details.includes(original.copy[locale].body));
    }
  }
  assert.equal(read("backfill-report.json").uncertainties.length, 30);
});

test("backfill is deterministic and safe to rerun", () => {
  const output = execFileSync(process.execPath, ["scripts/changelog-backfill.mjs", "--dry-run"], { encoding: "utf8" });
  assert.match(output, /63\/63 features/);
  assert.match(output, /0 changed files/);
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
