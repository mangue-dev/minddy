# Public MCP registry — publication contract (MIN-588)

minddy's MCP server is registered in the **official MCP registry**
(`registry.modelcontextprotocol.io`). This document records the decision, the
manifest, the authentication model, and what happens at each release.

## Decision: the official registry, not third-party directories

Three kinds of target were weighed: the official registry, curated commercial
directories (Pulse MCP, Glama, Smithery, …), and self-run aggregators.

The official registry wins because it is the substrate the others read:

- **Aggregators mirror it.** Their data stores are populated from the
  unauthenticated read-only REST API (`GET /v0.1/servers`, scraped roughly
  hourly, see the [aggregators guide](https://modelcontextprotocol.io/registry/registry-aggregators)).
  One entry there is the cheapest way to appear everywhere that matters.
- **MCP clients consume it directly.** Claude, the MCP Inspector, and the
  client catalogs (including the in-app search minddy itself consumes in
  MIN-586) resolve `server.json` entries from it.
- **A listing site is manual, unverified work** with per-directory accounts;
  none carries the weight of the official namespace.

Nothing forbids adding a Pulse or Smithery listing later; they are marketing
surfaces, not the source of truth.

## What is published

The root `server.json` describes the **hosted instance**
(`https://www.minddy.app/api/mcp`), which is the only entry the official
registry can meaningfully hold:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.mangue-dev/minddy",
  "title": "minddy",
  "description": "Minimal issue tracker: projects, objectives and trackable plans, written by agents over MCP.",
  "version": "0.10.30",
  "websiteUrl": "https://www.minddy.app",
  "repository": { "url": "https://github.com/mangue-dev/minddy", "source": "github", "id": "1288848861" },
  "remotes": [{ "type": "streamable-http", "url": "https://www.minddy.app/api/mcp" }]
}
```

- **Remote-only.** minddy's server is stateless Streamable HTTP behind OAuth
  2.1 discovery (the `/.well-known` routes), so there is no `packages` block:
  the registry requires no package-ownership proof (npm `mcpName`, OCI
  annotation, …) for a remote entry.
- **OAuth is implicit.** The registry schema has no authentication field for
  remotes; clients authenticate themselves through the standard
  RFC 9727 discovery chain served by the instance.
- **Description ≤ 100 characters.** A hard limit enforced server-side by the
  registry.

## Authentication: GitHub OIDC

Publishing must happen from a verified namespace. Options were GitHub device
flow, DNS TXT records, `/.well-known/mcp-registry-auth`, and GitHub OIDC.
GitHub OIDC is used:

- **No secret to rotate.** `mcp-publisher login github-oidc` exchanges the
  workflow's OIDC token for a registry token, scoped to the repository owner
  (`mangue-dev`), which fixes the server name namespace
  (`io.github.mangue-dev/*`) without a DNS record or an extra well-known file.
- **Headless.** The device flow would need a human at every publish; OIDC
  runs unattended inside Actions.

## Automation per release

Every publish needs a **new unique version**, so the manifest is versioned
with the core release:

1. `npm run release:prepare -- <version>` bumps `server.json` alongside
   `package.json` (see `scripts/prepare-release.mjs`).
2. `scripts/mcp-registry-manifest.test.mjs` keeps the manifest honest in CI:
   namespace, hosted endpoint, schema, and version sync with `package.json`.
3. Once the release ships, `.github/workflows/publish-mcp-registry.yml` runs
   (on the GitHub release `published` event, or manually): it fetches the
   checksum-pinned `mcp-publisher` (`scripts/fetch-mcp-publisher.mjs`), logs
   in with OIDC, and publishes.

The workflow is separate from `release.yml` on purpose: a registry outage
must neither fail a finished release nor make the release unreplayable.
Replay = run the workflow with the version as input.

The pin lives in `scripts/fetch-mcp-publisher.mjs` (version + one sha256 per
platform, taken from the `registry_<version>_checksums.txt` asset of the
[modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry)
release). Upgrading the tool means updating those constants deliberately.

## Local verification

```bash
# Schema + official-registry validation, no publish:
node scripts/fetch-mcp-publisher.mjs /tmp/mcp && /tmp/mcp/mcp-publisher validate
```

macOS and Linux developers run the extracted `mcp-publisher` directly; on
Windows the archive ships `mcp-publisher.exe`, which the fetch script resolves
per platform (`/tmp/mcp/mcp-publisher.exe validate`).

`mcp-publisher publish` performs the real submission and requires a login.

## Out of scope

- **Self-hosted instances** are not registered: the registry is a curated
  global namespace, not a directory of deployments. An operator who wants a
  public listing publishes their own `server.json` under their own namespace.
- **Deleting a version** is not supported by the registry (metadata is
  immutable once published, like npm).
