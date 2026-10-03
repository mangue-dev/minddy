#!/usr/bin/env node
/** Publish only after GitHub records a successful production deployment of this SHA. */
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDraft, validateIndex, validateRelease, mergeIndex, VERSION_PATTERN } from "./changelog-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function verifyProof(proof, sha) {
  if (proof.sha !== sha || proof.environment !== "Production" || proof.state !== "success"
    || !Number.isSafeInteger(proof.deploymentId) || proof.deploymentId <= 0
    || !Number.isFinite(Date.parse(proof.publishedAt))) throw new Error("A successful production deployment of the exact SHA is required");
}

/** Immutable release uploads precede the index update, so partial failures remain invisible. */
export async function publishRelease({ draft, sha, proof, index, upload }) {
  verifyProof(proof, sha);
  validateIndex(index);
  const existing = index.find(r => r.version === draft.version);
  if (existing) return { index, published: false };
  validateDraft(draft);
  const release = validateRelease({ ...draft, sha, deploymentId: proof.deploymentId, publishedAt: proof.publishedAt });
  const next = mergeIndex(index, release);
  await upload(`releases/${draft.version}.json`, release, false);
  await upload("index.json", next, true);
  return { index: next, published: true };
}

function storageConfig() {
  const base = process.env.MINDDY_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !token) throw new Error("Changelog publication needs MINDDY_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in cloud-production");
  return { base, token };
}
async function isMissing(response) {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  try {
    const error = await response.clone().json();
    return String(error.statusCode) === "404" || error.error === "not_found";
  } catch { return false; }
}
export function createStorage({ base, token }, fetcher = fetch) {
  const headers = { Authorization: `Bearer ${token}`, apikey: token, "Content-Type": "application/json" };
  async function request(url, options = {}) {
    return fetcher(`${base}/storage/v1/${url}`, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000) });
  }
  return {
    async ensureBucket() {
      let response = await request("bucket/changelog");
      if (await isMissing(response)) {
        response = await request("bucket", { method: "POST", body: JSON.stringify({ id: "changelog", name: "changelog", public: true,
          file_size_limit: 1048576, allowed_mime_types: ["application/json"] }) });
        if (!response.ok) throw new Error(`Cannot create changelog bucket (${response.status})`);
      } else if (!response.ok || !(await response.json()).public) throw new Error("The changelog bucket must exist and be public");
    },
    async index() {
      const response = await request("object/changelog/index.json");
      if (await isMissing(response)) return null;
      if (!response.ok) throw new Error(`Cannot read publication index (${response.status})`);
      return validateIndex(await response.json());
    },
    async upload(file, value, overwrite) {
      const response = await request(`object/changelog/${file}`, { method: "POST", headers: {
        "x-upsert": overwrite ? "true" : "false", "cache-control": overwrite ? "max-age=60" : "max-age=31536000",
      }, body: JSON.stringify(value) });
      if (!response.ok) {
        // A retry can find an object uploaded before a failed index write. Verify it exactly.
        if (!overwrite && [400, 409].includes(response.status)) {
          const existing = await request(`object/changelog/${file}`);
          if (existing.ok && JSON.stringify(await existing.json()) === JSON.stringify(value)) return;
        }
        throw new Error(`Cannot upload changelog ${file} (${response.status})`);
      }
    },
  };
}

export async function productionProof(sha) {
  const repo = process.env.GITHUB_REPOSITORY ?? "mangue-dev/minddy";
  if (repo !== "mangue-dev/minddy") throw new Error("Publication is restricted to mangue-dev/minddy");
  const gh = args => JSON.parse(execFileSync("gh", args, { cwd: root, encoding: "utf8" }));
  const deployments = gh(["api", `repos/${repo}/deployments?sha=${sha}&environment=Production&per_page=100`]);
  const successes = [];
  for (const d of deployments) {
    if (d.sha !== sha || d.environment !== "Production") continue;
    const statuses = gh(["api", `repos/${repo}/deployments/${d.id}/statuses`]);
    if (statuses[0]?.state !== "success") continue;
    const publishedAt = statuses.filter(s => s.state === "success").map(s => s.created_at).sort()[0];
    successes.push({ sha, environment: d.environment, state: "success", deploymentId: d.id, publishedAt });
  }
  const proof = successes.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))[0];
  if (!proof) throw new Error("No successful production deployment for this SHA");
  verifyProof(proof, sha);
  return proof;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args[0] === "--check";
  const sha = check ? args[1] : args[0];
  if (!/^[a-f0-9]{40}$/.test(sha ?? "") || args.length !== (check ? 2 : 1)) throw new Error("Usage: node scripts/changelog-publish.mjs [--check] <production-sha>");
  if (execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() !== sha) throw new Error("Checkout must match the target SHA");
  const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
  if (!VERSION_PATTERN.test(version)) throw new Error("A stable release version is required");
  const historical = validateIndex(JSON.parse(await readFile(path.join(root, "content/changelog/index.json"), "utf8")));
  if (historical.some(r => r.version === version)) { console.log(`v${version} already has a historical publication entry.`); return; }
  const storage = createStorage(storageConfig());
  // Configuration and content are checked before promotion; this mode has no side effects.
  const existing = await storage.index();
  if (existing?.some(r => r.version === version)) { console.log(`v${version} is already published; keeping its original entry.`); return; }
  const draft = validateDraft(JSON.parse(await readFile(path.join(root, `content/changelog/drafts/${version}.json`), "utf8")));
  if (draft.version !== version) throw new Error("Draft version does not match package.json");
  const publishedIds = new Set((existing ?? historical).flatMap(r => r.featureIds));
  if (draft.features.some(f => publishedIds.has(f.id))) throw new Error("A feature slug is already published; choose a distinct slug for this update");
  for (const commit of draft.evidence.commits) execFileSync("git", ["merge-base", "--is-ancestor", commit, sha], { cwd: root });
  if (check) { console.log(`Validated changelog draft for v${version}.`); return; }
  const proof = await productionProof(sha);
  await storage.ensureBucket();
  if (!existing) {
    for (const entry of historical) {
      const release = validateRelease(JSON.parse(await readFile(path.join(root, `content/changelog/releases/${entry.version}.json`), "utf8")));
      await storage.upload(`releases/${entry.version}.json`, release, false);
    }
  }
  const result = await publishRelease({ draft, sha, proof, index: existing ?? historical, upload: storage.upload });
  console.log(result.published ? `Published changelog v${version} after production deployment ${proof.deploymentId}.` : `v${version} already published.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
