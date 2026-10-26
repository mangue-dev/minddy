/**
 * Encrypted demo content for the capture seeds.
 *
 * A demo project with a content key accepts its protected rows (an objective's
 * name and description, for instance) only encrypted: the database refuses a
 * plaintext insert with `<table>_requires_encryption`. The seeds are plain Node
 * scripts and cannot import the server codec directly, so this module bundles
 * the application's own repository codec with esbuild — the same approach as
 * `scripts/build-pages-md.mjs` — and runs it with the keys of `.env`. There is
 * no second copy of the cryptography here.
 *
 * Three rules keep it inside the demo world:
 *
 * - it refuses the production database, like every capture write;
 * - it encodes a row only for a project the guards proved to be a demo project;
 * - it never creates a key. A project with a current content key gets an
 *   encrypted row; a project without one keeps its plaintext row, which the
 *   database accepts. Asking the codec to encrypt for a keyless project would
 *   make it create the key — a write outside the guards.
 *
 * Encoding only returns a row: the write itself still goes through
 * `createPlan()` in `guards.mjs`. Decoding is read-only (decryption audits are
 * silent, lib/server/encryption/audit.ts).
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { assertNonProductionDatabase } from "./database-target.mjs";
import { loadEnv, ROOT } from "./env.mjs";

/** The tables a seed may encode, with the repository functions that own them. */
const CODECS = {
  objectives: { encode: "encodeObjective", decode: "decodeObjective" },
  comments: { encode: "encodeIssueComment", decode: "decodeIssueComment" },
};

// The comment repository resolves the owning project through its parent
// ticket with a client: the service client, like every other server writer.
const ENTRY = `
export { encodeObjective, decodeObjective } from "@/lib/server/objective-store";
export { SupabaseKeyRegistry } from "@/lib/server/encryption/registry";
import { encodeComment, decodeComment } from "@/lib/server/comment-store";
import { getServiceClient } from "@/lib/supabase-service";
export const encodeIssueComment = (row) => encodeComment(getServiceClient(), "comments", row);
export const decodeIssueComment = (row) => decodeComment("comments", row);
`;

let bundled = null;

async function loadBundle() {
  if (bundled) return bundled;
  const outfile = resolve(ROOT, "output/.cache/capture-content-codec-v2.mjs");
  await mkdir(resolve(outfile, ".."), { recursive: true });
  await build({
    stdin: { contents: ENTRY, resolveDir: ROOT, loader: "ts" },
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    // Dependencies resolve from the repository's node_modules at load time.
    packages: "external",
    tsconfig: resolve(ROOT, "tsconfig.json"),
    alias: { "server-only": resolve(ROOT, "scripts/server-only-stub.js") },
    logLevel: "warning",
  });
  bundled = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  return bundled;
}

/**
 * What a seed may do with a protected row of `projectId`: encrypt it with the
 * project's existing key, or keep it plaintext when the project has none.
 * Pure, so the policy is tested without a database.
 */
export function protectedWriteMode({ table, projectId, demoProjectIds, hasCurrentKey }) {
  if (!CODECS[table]) throw new Error(`captures: no content codec for "${table}".`);
  if (typeof projectId !== "string" || !demoProjectIds.has(projectId)) {
    throw new Error(`captures: refusing to encode a "${table}" row outside the demo projects.`);
  }
  return hasCurrentKey ? "encrypt" : "plaintext";
}

/**
 * The codec of the demo world: `encode(table, row)` returns the row ready for
 * a guarded insert, `decode(table, row)` its readable content.
 */
export async function openContentCodec(world) {
  loadEnv();
  assertNonProductionDatabase(process.env.MINDDY_PUBLIC_SUPABASE_URL, "encrypted capture seeds");
  const codec = await loadBundle();
  const registry = new codec.SupabaseKeyRegistry("content");
  const keyed = new Map();
  const hasCurrentKey = async (projectId) => {
    if (!keyed.has(projectId)) {
      keyed.set(projectId, (await registry.loadCurrent({ kind: "project", id: projectId })) !== null);
    }
    return keyed.get(projectId);
  };
  const demoProjectIds = world.demoIds.projects ?? new Set();

  return {
    async encode(table, row) {
      const mode = protectedWriteMode({
        table,
        projectId: row.project_id,
        demoProjectIds,
        hasCurrentKey: await hasCurrentKey(row.project_id),
      });
      return mode === "encrypt" ? codec[CODECS[table].encode](row) : row;
    },
    async decode(table, row) {
      if (!CODECS[table]) throw new Error(`captures: no content codec for "${table}".`);
      return codec[CODECS[table].decode](row);
    },
  };
}
