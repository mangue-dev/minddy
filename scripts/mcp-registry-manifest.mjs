/**
 * Constants and checks for the public MCP registry manifest (`server.json`).
 *
 * minddy publishes the MCP server of the hosted instance to the official
 * registry (`registry.modelcontextprotocol.io`); see
 * `docs/mcp-registry-publication.md`. The manifest is versioned with the core
 * release (bumped by `scripts/prepare-release.mjs`) because every publish must
 * carry a new unique version.
 */

/** JSON schema dialect the official registry currently validates against. */
export const REGISTRY_MANIFEST_SCHEMA =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

/**
 * Namespace reserved through GitHub OIDC publishing: the repository owner,
 * so a moved or renamed repository keeps answering for its server name.
 * The checks derive their prefix from it instead of hardcoding it.
 */
export const REGISTRY_MANIFEST_NAME = "io.github.mangue-dev/minddy";

/** Namespace prefix that GitHub OIDC publishing allows for this repository. */
export const REGISTRY_NAMESPACE_PREFIX = `${REGISTRY_MANIFEST_NAME.split("/")[0]}/`;

/** Hosted instance the registry entry describes (self-hosted instances are out of scope). */
export const HOSTED_SITE_URL = "https://www.minddy.app";
export const HOSTED_MCP_ENDPOINT = `${HOSTED_SITE_URL}/api/mcp`;

/** Official registry limit on the `description` field. */
export const MCP_REGISTRY_DESCRIPTION_LIMIT = 100;

/**
 * Structural checks the registry would otherwise only report at publish time.
 * Throws a precise error on the first field that drifted.
 */
export function assertRegistryManifest(manifest) {
  for (const field of ["$schema", "name", "description", "version", "websiteUrl", "remotes"]) {
    if (manifest[field] === undefined) throw new Error(`server.json misses ${field}.`);
  }
  if (manifest.$schema !== REGISTRY_MANIFEST_SCHEMA) {
    throw new Error(`server.json must use schema ${REGISTRY_MANIFEST_SCHEMA}.`);
  }
  if (!manifest.name.startsWith(REGISTRY_NAMESPACE_PREFIX)) {
    throw new Error(
      `server.json must stay in the GitHub OIDC namespace of the repository owner (${REGISTRY_NAMESPACE_PREFIX}*).`,
    );
  }
  if (manifest.name !== REGISTRY_MANIFEST_NAME) {
    throw new Error(`server.json name must be ${REGISTRY_MANIFEST_NAME}.`);
  }
  if (manifest.description.length > MCP_REGISTRY_DESCRIPTION_LIMIT) {
    throw new Error(
      `server.json description exceeds ${MCP_REGISTRY_DESCRIPTION_LIMIT} characters (official registry limit).`,
    );
  }
  if (manifest.websiteUrl !== HOSTED_SITE_URL) {
    throw new Error(`server.json websiteUrl must be ${HOSTED_SITE_URL}.`);
  }
  if (manifest.repository?.url !== "https://github.com/mangue-dev/minddy") {
    throw new Error("server.json repository must be the canonical minddy repository.");
  }
  const remote = manifest.remotes?.[0];
  if (
    manifest.remotes?.length !== 1 ||
    remote?.type !== "streamable-http" ||
    remote?.url !== HOSTED_MCP_ENDPOINT
  ) {
    throw new Error(`server.json must expose a single streamable-http remote on ${HOSTED_MCP_ENDPOINT}.`);
  }
  return manifest;
}

/** Reads and asserts the repository manifest. */
export async function loadRegistryManifest(root) {
  const { readFile } = await import("node:fs/promises");
  const manifest = JSON.parse(await readFile(`${root}/server.json`, "utf8"));
  return assertRegistryManifest(manifest);
}
