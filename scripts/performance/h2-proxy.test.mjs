import assert from "node:assert/strict";
import test from "node:test";
import { shouldCompress } from "./h2-proxy.mjs";

test("compresses uncompressed API JSON, RSC payloads and scripts for brotli clients", () => {
  assert.equal(shouldCompress({ "content-type": "application/json" }, "gzip, deflate, br"), true);
  assert.equal(shouldCompress({ "content-type": "text/x-component" }, "br"), true);
  assert.equal(shouldCompress({ "content-type": "application/javascript; charset=utf-8" }, "br"), true);
});

test("passes through responses the upstream already encoded or that do not compress", () => {
  assert.equal(shouldCompress({ "content-type": "text/html", "content-encoding": "gzip" }, "br"), false);
  assert.equal(shouldCompress({ "content-type": "image/png" }, "br"), false);
  assert.equal(shouldCompress({ "content-type": "application/json" }, "gzip"), false);
  assert.equal(shouldCompress({}, "br"), false);
});
