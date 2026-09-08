import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { prepareFunctionsBundle } from "./prepare-self-hosted-functions.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "minddy-functions-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  };
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  const compose = "services:\n  functions:\n    image: supabase/edge-runtime:v1.74.0\n";
  const main = "import * as jose from 'jsr:@panva/jose@6';\n";
  write("package.json", { version: "1.0.0" });
  write("deploy/self-hosted/functions-bundle.json", { upstreamMainSha256: sha(main), importSpecifier: "jsr:@panva/jose@6", joseVersion: "6.2.3" });
  write("deploy/self-hosted/compatibility.json", { entries: [{ minddyRelease: "1.0.0", supabase: { completeOfficial: { dockerComposeSha256: sha(compose) } } }] });
  write("upstream/docker/docker-compose.yml", compose);
  write("upstream/docker/volumes/functions/main/index.ts", main);
  write("node_modules/jose/package.json", { name: "jose", version: "6.2.3", main: "dist/webapi/index.js" });
  write("node_modules/jose/dist/webapi/index.js", "export const fixture = true;");
  return { root, write, options: { root, supabaseDir: join(root, "upstream"), envFile: join(root, ".env") } };
}

test("offline compilation has no network or instance credentials and leaves upstream unchanged", (t) => {
  const { root, options } = fixture(t);
  const input = readFileSync(join(root, "upstream/docker/volumes/functions/main/index.ts"), "utf8");
  const output = prepareFunctionsBundle({ ...options, run(args) {
    assert.equal(args[args.indexOf("--network") + 1], "none");
    assert.ok(!args.includes("--env-file"));
    assert.deepEqual(args.filter((_, index) => args[index - 1] === "--env"), ["DENO_DIR=/tmp/deno"]);
    const mounts = args.filter((_, index) => args[index - 1] === "--mount");
    assert.ok(mounts.find((mount) => mount.includes("dst=/input,readonly")));
    const inputDir = /src=(.*),dst=\/input,readonly/.exec(mounts.find((mount) => mount.endsWith("dst=/input,readonly")))[1];
    assert.equal(readFileSync(join(inputDir, "vendor/jose/dist/webapi/index.js"), "utf8"), "export const fixture = true;");
    const staging = /src=(.*),dst=\/output/.exec(mounts.find((mount) => mount.endsWith("dst=/output")))[1];
    writeFileSync(join(staging, "main.eszip"), "compiled fixture");
  } });
  assert.equal(readFileSync(join(output, "main.eszip"), "utf8"), "compiled fixture");
  assert.equal(readFileSync(join(root, "upstream/docker/volumes/functions/main/index.ts"), "utf8"), input);
  assert.equal(readdirSync(root).filter((name) => name.startsWith(".env.functions-build-")).length, 0);
});

test("a changed upstream function is rejected before starting the compiler", (t) => {
  const { write, options } = fixture(t);
  write("upstream/docker/volumes/functions/main/index.ts", "changed upstream");
  assert.throws(() => prepareFunctionsBundle({ ...options, run() { assert.fail("must not execute"); } }), /differs from the verified release pin/);
});

test("a compiler failure preserves the last working bundle", (t) => {
  const { root, write, options } = fixture(t);
  write(".env.functions/main.eszip", "previous bundle");
  assert.throws(() => prepareFunctionsBundle({ ...options, run() { throw new Error("compiler failed"); } }), /compiler failed/);
  assert.equal(readFileSync(join(root, ".env.functions/main.eszip"), "utf8"), "previous bundle");
  assert.equal(readdirSync(root).filter((name) => name.startsWith(".env.functions-build-")).length, 0);
});

test("a different dependency version cannot silently change the offline runtime", (t) => {
  const { write, options } = fixture(t);
  write("node_modules/jose/package.json", { name: "jose", version: "7.0.0", main: "dist/webapi/index.js" });
  assert.throws(() => prepareFunctionsBundle(options), /requires jose 6.2.3/);
});
