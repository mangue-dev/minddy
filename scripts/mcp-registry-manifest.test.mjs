import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MCP_REGISTRY_DESCRIPTION_LIMIT,
  OFFICIAL_MCP_REGISTRY,
  assertRegistryManifest,
  loadRegistryManifest,
} from "./mcp-registry-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the registry manifest keeps the release version", async () => {
  const [manifest, packageJson] = await Promise.all([
    loadRegistryManifest(root),
    readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
  ]);
  assert.equal(manifest.version, packageJson.version);
});

test("the registry manifest matches the GitHub OIDC namespace", async () => {
  const manifest = await loadRegistryManifest(root);
  assert.equal(manifest.name, "io.github.mangue-dev/minddy");
  assert.equal(manifest.repository?.source, "github");
  assert.equal(manifest.repository?.url, "https://github.com/mangue-dev/minddy");
});

test("the registry manifest points at the hosted instance endpoint", async () => {
  const manifest = await loadRegistryManifest(root);
  assert.equal(manifest.websiteUrl, "https://www.minddy.app");
  assert.deepEqual(
    manifest.remotes,
    [{ type: "streamable-http", url: "https://www.minddy.app/api/mcp" }],
  );
});

test("the registry manifest carries the official schema", async () => {
  const manifest = await loadRegistryManifest(root);
  assert.equal(
    manifest.$schema,
    "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  );
});

test("the registry manifest stays within the official registry limits", async () => {
  const manifest = await loadRegistryManifest(root);
  assert.ok(
    manifest.description.length <= MCP_REGISTRY_DESCRIPTION_LIMIT,
    `description must stay within ${MCP_REGISTRY_DESCRIPTION_LIMIT} characters`,
  );
});

test("assertRegistryManifest rejects a drifted manifest", () => {
  assert.throws(
    () =>
      assertRegistryManifest({
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.github.other/minddy",
        description: "x".repeat(80),
        version: "9.9.9",
        websiteUrl: "https://www.minddy.app",
        repository: { url: "https://github.com/mangue-dev/minddy", source: "github" },
        remotes: [{ type: "streamable-http", url: "https://www.minddy.app/api/mcp" }],
      }),
    /namespace/,
  );
});

test("the helper exposes the official registry base URL used by the workflow", () => {
  assert.equal(OFFICIAL_MCP_REGISTRY, "https://registry.modelcontextprotocol.io");
});
