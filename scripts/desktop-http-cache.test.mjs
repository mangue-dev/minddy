import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mitigateSource, patchDesktopHttpCache, PATCHED_SHA256 } from "./patch-desktop-http-cache.mjs";

const desktop = fileURLToPath(new URL("../desktop/", import.meta.url));
const desktopRequire = createRequire(path.join(desktop, "package.json"));
// Exercise the dependency actually used by the builder, rather than a root copy.
const builderRequire = createRequire(desktopRequire.resolve("app-builder-lib/package.json"));
const getRequire = createRequire(builderRequire.resolve("@electron/get"));
const gotRequire = createRequire(getRequire.resolve("got"));
const requestRequire = createRequire(gotRequire.resolve("cacheable-request"));
const installedSource = requestRequire.resolve("http-cache-semantics");
const CachePolicy = requestRequire(process.env.MINDDY_HTTP_CACHE_SOURCE || installedSource);
const epoch = Date.parse("2026-10-04T00:00:00Z");
const request = (headers = {}, url = "https://downloads.example.test/artifact") => ({
  url, method: "GET", headers: { host: "downloads.example.test", ...headers },
});
function policy(headers, { shared = true, age = 1, req = request() } = {}) {
  const result = new CachePolicy(req, {
    status: 200, headers: { date: new Date(epoch).toUTCString(), etag: '"artifact"', ...headers },
  }, { shared });
  result._responseTime = epoch;
  result.now = () => epoch + age * 1000;
  return result;
}

const restricted = [
  ["shared cookie", { "cache-control": "max-age=600", "set-cookie": "session=other-user" }],
  ["shared proxy revalidation", { "cache-control": "max-age=600, proxy-revalidate" }],
  ["response no-cache", { "cache-control": "max-age=600, no-cache" }],
  ["response no-store", { "cache-control": "max-age=600, no-store" }],
  ["shared private response", { "cache-control": "max-age=600, private" }],
  ["Vary wildcard", { "cache-control": "max-age=600", vary: "*" }],
  ["combined Vary wildcard", { "cache-control": "max-age=600", vary: "accept, *" }],
];
for (const [name, headers] of restricted) {
  test(`${name} cannot bypass validation with bounded or unbounded max-stale`, () => {
    for (const directive of ["max-stale", "max-stale=999999"]) {
      const cached = policy(headers);
      for (const current of [cached, CachePolicy.fromObject(cached.toObject())]) {
        current.now = cached.now;
        const req = request({ "cache-control": directive });
        assert.equal(current.satisfiesWithoutRevalidation(req), false);
        const decision = current.evaluateRequest(req);
        assert.equal(decision.response, undefined);
        assert.equal(decision.revalidation.synchronous, true);
      }
    }
  });
  test(`${name} cannot bypass validation through stale extensions`, () => {
    const cached = policy({
      ...headers,
      "cache-control": `${headers["cache-control"]}, stale-while-revalidate=999999, stale-if-error=999999`,
    });
    assert.equal(cached.useStaleWhileRevalidate(), false);
    assert.equal(cached.timeToLive(), 0);
    assert.equal(cached.revalidatedPolicy(request(), { status: 503, headers: {} }).modified, true);
    assert.throws(() => cached.revalidatedPolicy(request(), undefined), /Response headers missing/);
  });
}

test("stale must-revalidate and shared s-maxage cannot use any stale override", () => {
  for (const directive of ["must-revalidate", "s-maxage=0"]) {
    const cached = policy({ "cache-control": `max-age=0, ${directive}, stale-if-error=600, stale-while-revalidate=600` });
    assert.equal(cached.satisfiesWithoutRevalidation(request({ "cache-control": "max-stale" })), false);
    assert.equal(cached.useStaleWhileRevalidate(), false);
    assert.equal(cached.timeToLive(), 0);
    assert.equal(cached.revalidatedPolicy(request(), { status: 503, headers: {} }).modified, true);
  }
});

test("ordinary expiration still permits bounded and unbounded stale reuse", () => {
  const cached = policy({ "cache-control": "public, max-age=10" }, { age: 15 });
  assert.equal(cached.satisfiesWithoutRevalidation(request()), false);
  assert.equal(cached.satisfiesWithoutRevalidation(request({ "cache-control": "max-stale=4" })), false);
  assert.equal(cached.satisfiesWithoutRevalidation(request({ "cache-control": "max-stale=6" })), true);
  assert.equal(cached.satisfiesWithoutRevalidation(request({ "cache-control": "max-stale" })), true);
});

test("ordinary stale extensions and matching 304 validation remain usable", () => {
  const cached = policy({ "cache-control": "public, max-age=10, stale-while-revalidate=20, stale-if-error=30" }, { age: 15 });
  assert.equal(cached.useStaleWhileRevalidate(), true);
  assert.equal(cached.evaluateRequest(request()).revalidation.synchronous, false);
  assert.equal(cached.timeToLive(), 25000);
  assert.equal(cached.revalidatedPolicy(request(), { status: 503, headers: {} }).modified, false);
  const restrictedCookie = policy({ "cache-control": "max-age=600", "set-cookie": "session=user" });
  const validated = restrictedCookie.revalidatedPolicy(request(), {
    status: 304, headers: { etag: '"artifact"', date: new Date(epoch + 1000).toUTCString() },
  });
  assert.equal(validated.matches, true);
  assert.equal(validated.modified, false);
});

test("request no-cache, Pragma and mismatched identity block error fallback", () => {
  const cached = policy({ "cache-control": "public, max-age=0, stale-if-error=600", vary: "accept" });
  const mismatches = [
    request({ "cache-control": "no-cache" }), request({ pragma: "no-cache" }),
    request({}, "https://downloads.example.test/other"), request({ host: "other.example.test" }),
    request({ accept: "application/json" }), { ...request(), method: "POST" },
  ];
  for (const req of mismatches) {
    assert.equal(cached.revalidatedPolicy(req, { status: 503, headers: {} }).modified, true);
    assert.throws(() => cached.revalidatedPolicy(req, undefined), /Response headers missing/);
  }
});

test("public and immutable cookie opt-ins and private caches retain allowed reuse", () => {
  for (const directive of ["public", "immutable"]) {
    const cached = policy({ "cache-control": `max-age=0, ${directive}`, "set-cookie": "session=user" });
    assert.equal(cached.satisfiesWithoutRevalidation(request({ "cache-control": "max-stale" })), true);
  }
  for (const headers of [
    { "cache-control": "private, max-age=0", "set-cookie": "session=user" },
    { "cache-control": "proxy-revalidate, max-age=0" },
    { "cache-control": "s-maxage=0, max-age=0" },
  ]) {
    assert.equal(policy(headers, { shared: false }).satisfiesWithoutRevalidation(request({ "cache-control": "max-stale" })), true);
  }
});

test("authenticated shared responses require explicit storage permission", () => {
  const cached = policy({ "cache-control": "max-age=600, stale-if-error=600" }, {
    req: request({ authorization: "Bearer synthetic" }),
  });
  assert.equal(cached.satisfiesWithoutRevalidation(request({ "cache-control": "max-stale" })), false);
  assert.equal(cached.revalidatedPolicy(request(), { status: 503, headers: {} }).modified, true);
});

test("installer is idempotent and rejects tampering and unreviewed upgrades", async () => {
  const source = await readFile(installedSource, "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"), PATCHED_SHA256);
  assert.throws(() => mitigateSource(`${source}\n`), /Unexpected/);
  const fixture = await mkdtemp(path.join(os.tmpdir(), "minddy-cache-mitigation-"));
  try {
    const name = "node_modules/http-cache-semantics";
    const directory = path.join(fixture, name);
    await mkdir(directory, { recursive: true });
    const writeVersion = async (version) => {
      await writeFile(path.join(fixture, "package-lock.json"), JSON.stringify({ packages: { [name]: { version } } }));
      await writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "http-cache-semantics", version }));
    };
    await writeVersion("4.2.0");
    await writeFile(path.join(directory, "index.js"), source);
    await patchDesktopHttpCache(fixture);
    await patchDesktopHttpCache(fixture);
    assert.equal(await readFile(path.join(directory, "index.js"), "utf8"), source);
    await writeFile(path.join(directory, "index.js"), `${source}\n`);
    await assert.rejects(patchDesktopHttpCache(fixture), /Unexpected/);
    await writeVersion("4.2.1");
    await assert.rejects(patchDesktopHttpCache(fixture), /version changed/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
