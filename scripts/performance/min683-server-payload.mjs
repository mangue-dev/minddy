import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, id } from "./seed.mjs";
import { parseAllStartupTiming, verifyBoardResponse } from "./all-startup-timing-parser.mjs";

assert.ok(process.argv.includes("--run-diagnostic"), "Explicit fixture diagnostic admission is required");
loadEnv();
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
assert.equal(new URL(base).origin, base);
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const buildRoot = process.env.MINDDY_PERF_BUILD_ROOT;
assert.ok(buildRoot, "Identify the actual served product root");
const label = process.env.MINDDY_PERF_LABEL ?? "min683-server-payload-1";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const output = path.resolve("output/playwright/performance", `${label}.json`);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fingerprint = (value) => hash(JSON.stringify(value));
const fixture = JSON.parse(await readFile("output/playwright/performance/workload.json", "utf8"));
assert.equal(fixture.email, EMAIL); assert.equal(fixture.marker, MARKER);
assert.equal(fixture.userId, "86df71f9-44a7-4cc1-8085-5baa6c744490");
const referencePath = process.env.MINDDY_PERF_REFERENCE_RESULT;
assert.ok(referencePath, "Require an identified complete ordinary source reference");
const reference = JSON.parse(await readFile(referencePath, "utf8"));
assert.equal(reference.status, "complete-with-open-acceptance");
const expected = reference.workload.connectedBoard;
assert.ok(expected?.sourceIssues === 1206 && expected.cards === 1086);
const productSource = await readFile(path.join(buildRoot, ".next/min683-product.json"), "utf8");
const product = JSON.parse(productSource);
assert.equal(product.build, (await readFile(path.join(buildRoot, ".next/BUILD_ID"), "utf8")).trim());
assert.equal(product.build, reference.build); assert.equal(product.sha, reference.sha);
const result = { label, protocol: "min683-excluded-server-payload-v1", product, base,
  timestamp: new Date().toISOString(), status: "running", referenceFile: path.basename(referencePath),
  referenceHash: hash(await readFile(referencePath)), collectorHash: hash(await readFile(new URL(import.meta.url))),
  requests: [], preservation: {}, limitations: ["Sequential quiet authenticated local API reads; no UI latency comparison or cold-instance claim.",
    "Decoded HTTP response bytes and JSON field bytes are exact; they are not wire/compression bytes.",
    "Server issue DB spans include PostgREST, transport and parsing; SQL plans are separate evidence.",
    "No forge endpoint, account metadata write, content write, tab write or schema change is requested."] };
const cookies = [];
const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
let failed = false;
async function get(route, { admitted = false, measured = true } = {}) {
  const began = performance.now();
  const response = await fetch(`${base}${route}`, { method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "), "Accept-Encoding": "identity",
      ...(admitted ? { "x-minddy-performance-diagnostic": "all-startup-v1" } : {}) } });
  const headersMs = performance.now() - began;
  if (response.status === 429 || response.status === 403) {
    result.backoff = { status: response.status, retryAfter: response.headers.get("retry-after") };
    throw new Error("Authorization or actual backoff stops this diagnostic");
  }
  assert.equal(response.status, 200, "The authorized diagnostic requires successful ordinary responses");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length <= 8 * 1024 * 1024, "Bound diagnostic response inspection");
  const bodyMs = performance.now() - began;
  const decoded = JSON.parse(bytes.toString("utf8"));
  if (measured) result.requests.push({ route: route.replaceAll(fixture.projects[0], ":project").replaceAll(fixture.projects[1], ":foreignProject")
      .replaceAll(id("page-0-10"), ":page").replaceAll(id("page-1-0"), ":foreignPage"),
    status: response.status, admitted, headersMs, bodyMs, decodedBytes: bytes.length,
    contentEncoding: response.headers.get("content-encoding"), contentLength: response.headers.get("content-length"),
    rows: Array.isArray(decoded) ? decoded.length : undefined,
    serverTiming: admitted ? parseAllStartupTiming(response.headers.get("server-timing")) : undefined,
    fields: !Array.isArray(decoded) ? Object.fromEntries(Object.entries(decoded).map(([key, value]) => [key,
      { bytes: Buffer.byteLength(JSON.stringify(value)), rows: Array.isArray(value) ? value.length : undefined }])) : undefined,
    fingerprint: fingerprint(decoded) });
  return decoded;
}
try {
  const signed = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
  assert.equal(signed.error, null); assert.equal(signed.data.user.email, EMAIL);
  assert.equal(signed.data.user.id, fixture.userId);
  assert.equal(signed.data.user.user_metadata.performance_fixture, MARKER);
  assert.notEqual(signed.data.user.user_metadata.cycles_enabled, true, "Do not call a cycle-mutating GET");
  result.identity = { email: EMAIL, userId: fixture.userId, marker: MARKER, cyclesDisabled: true };
  const tabs = await get("/api/me/app-tabs", { measured: false });
  assert.equal(tabs.length, 10); assert.ok(tabs.every((tab) => tab.user_id === fixture.userId));
  const board = await get("/api/me/board", { admitted: true });
  result.sourceProof = verifyBoardResponse(board, expected, fingerprint);
  const project = fixture.projects[0], foreign = fixture.projects[1];
  const issues = await get(`/api/projects/${project}/issues`);
  assert.equal(issues.length, 670); assert.ok(issues.every((issue) => issue.project_id === project));
  const allIds = new Set(board.issues.map((row) => row.id));
  assert.ok(issues.every((issue) => allIds.has(issue.id)));
  result.projectOverlap = { rows: issues.length, containedInGlobal: true,
    resourceCountOnlyInProject: issues.every((issue) => typeof issue.resource_count === "number") &&
      board.issues.every((issue) => !Object.hasOwn(issue, "resource_count")) };
  for (const suffix of ["categories", "objectives", "members", "integrations", "issue-relations", "pages"])
    await get(`/api/projects/${project}/${suffix}`);
  const pages = [];
  for (const [projectId, pageId] of [[project, id("page-0-10")], [foreign, id("page-1-0")]]) {
    const route = `/api/projects/${projectId}/pages/${pageId}`;
    const page = await get(route); assert.equal(page.project_id, projectId);
    assert.equal(page.content.content.length, 80); pages.push({ route, fingerprint: fingerprint(page) });
  }
  assert.equal(fingerprint(await get("/api/me/app-tabs", { measured: false })), fingerprint(tabs));
  result.preservation.tenTabsUnchanged = true;
  for (const page of pages) assert.equal(fingerprint(await get(page.route, { measured: false })), page.fingerprint);
  result.preservation.pageBodiesAndVersionsUnchanged = true;
  result.finalSourceProof = verifyBoardResponse(await get("/api/me/board", { measured: false }), expected, fingerprint);
  result.preservation.completeIssueSourceUnchanged = true;
  assert.equal(await readFile(path.join(buildRoot, ".next/min683-product.json"), "utf8"), productSource);
  result.preservation.compiledProductUnchanged = true;
  result.status = "complete-excluded-diagnostic";
} catch {
  failed = true; result.status = "failed-excluded-diagnostic";
  result.failure = "Inspect fixed metadata, source proof and preservation; no private response is exported";
} finally {
  result.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ output, status: result.status }));
}
if (failed) process.exitCode = 1;
