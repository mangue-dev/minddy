import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { encryptionChoice, encryptionEnvironment } from "./self-hosting-encryption.mjs";
import { appendMissingEnv, parseArgs as bootstrapArgs, parseEnv } from "./bootstrap-supabase.mjs";
import { environmentValues, parseArgs as installerArgs, renderEnvironment } from "./self-hosting-install.mjs";

for (const choice of [undefined, "enabled", "disabled"]) {
  test(`server and local configuration honor encryption choice ${choice ?? "default"}`, () => {
    const argv = choice ? ["--encryption", choice] : [];
    const server = environmentValues(installerArgs([
      "--mode", "managed", "--app-url", "https://tickets.example.test", "--admin-email", "ops@example.test",
      "--supabase-url", "https://supabase.example.test", "--anon-key", "anon", "--service-role-key", "service", ...argv,
    ]));
    const full = environmentValues(installerArgs([
      "--mode", "full", "--app-url", "http://192.168.1.50", "--admin-email", "ops@example.test", ...argv,
    ]));
    const local = encryptionEnvironment({}, bootstrapArgs(argv).encryption);
    for (const values of [server, full, local]) {
      assert.equal(values.MINDDY_CONTENT_ENCRYPTION_ENABLED, choice === "disabled" ? "false" : "true");
      assert.match(values.MINDDY_DATA_ROOT_KEY, /^[a-f0-9]{64}$/);
    }
    assert.notEqual(server.MINDDY_DATA_ROOT_KEY, server.AI_KEY_ENCRYPTION_SECRET);
    const env = renderEnvironment("MINDDY_CONTENT_ENCRYPTION_ENABLED=true\nMINDDY_DATA_ROOT_KEY=replace-with-64-hex-characters\n", server);
    assert.ok(env.includes(`MINDDY_CONTENT_ENCRYPTION_ENABLED=${server.MINDDY_CONTENT_ENCRYPTION_ENABLED}`));
    assert.ok(env.includes(`MINDDY_DATA_ROOT_KEY=${server.MINDDY_DATA_ROOT_KEY}`));
  });
}

test("local bootstrap and desktop reruns preserve the selected flag and root", () => {
  const dir = mkdtempSync(join(tmpdir(), "minddy-encryption-"));
  try {
    for (const mode of ["enabled", "disabled"]) {
      const file = join(dir, mode);
      const first = encryptionEnvironment({}, mode);
      appendMissingEnv(file, first);
      const before = readFileSync(file, "utf8");
      const saved = Object.fromEntries(parseEnv(before));
      appendMissingEnv(file, encryptionEnvironment(saved));
      assert.equal(readFileSync(file, "utf8"), before);
      assert.deepEqual(encryptionEnvironment(saved, mode, { readOnly: true }), first);
      assert.throws(() => encryptionEnvironment(saved, mode === "enabled" ? "disabled" : "enabled"), /differs from the existing environment/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("legacy configuration is not silently enabled and missing protected keys stop reruns", () => {
  assert.equal(encryptionEnvironment({ MINDDY_EDITION: "self-hosted" }).MINDDY_CONTENT_ENCRYPTION_ENABLED, "false");
  assert.throws(() => encryptionEnvironment({ MINDDY_CONTENT_ENCRYPTION_ENABLED: "true" }), /Recover the original root key/);
  assert.throws(() => encryptionEnvironment({ MINDDY_CONTENT_ENCRYPTION_ENABLED: "false" }), /Recover the original root key/);
  assert.throws(() => encryptionEnvironment({ MINDDY_DATA_ROOT_KEY: "placeholder" }), /64 hexadecimal/);
  assert.throws(() => encryptionEnvironment({ MINDDY_CONTENT_ENCRYPTION_ENABLED: "yes" }), /true or false/);
  for (const parse of [installerArgs, bootstrapArgs]) {
    assert.throws(() => parse(["--encryption", "yes"]), /enabled or disabled/);
    assert.throws(() => parse(["--encryption"]), /expects a value/);
  }
  assert.throws(() => encryptionChoice(""), /enabled or disabled/);
});
