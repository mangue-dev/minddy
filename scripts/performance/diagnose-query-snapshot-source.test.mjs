import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { transform } from "esbuild";
import { digest, metadataExpression, persistenceProbeSource, restoreMetadataExpression, snapshotWireMetadata, publishedFeedbackProof } from "./diagnose-query-snapshot-source.mjs";

// Compile the canonical guard for portable coverage; do not copy its algorithm.
const canonical = await readFile(new URL("../../lib/query-snapshot-budget.ts", import.meta.url), "utf8");
const constants = new Map([...canonical.matchAll(/^(?:export )?const (MAX_[A-Z_]+) = (.+);$/gm)].map((match) => [match[1], String(vm.runInNewContext(match[2]))]));
const guard = canonical.replace(/^(?:export )?const MAX_[A-Z_]+ = .+;\n/gm, "").replace("export function", "function")
  .replace(/\bMAX_[A-Z_]+\b/g, (name) => `(${constants.get(name)})`);
const portable = (await transform(guard, { loader: "ts", minify: true })).code + `
  function selected(query){return query.state.status==="success"}
  const options={shouldDehydrateQuery:selected};
  const storage={persistClient:client=>{return JSON.stringify(client)}};
  function restored(query,mountedAt){const at=query.state.dataUpdatedAt;return at>0&&at<mountedAt&&!!query.queryKey}
  function restore(client,mountedAt){client.invalidateQueries({predicate:query=>restored(query,mountedAt),refetchType:"active"})}
`;
const cases = [{ name: "portable canonical guard", source: portable }];
test("requires the actual published unfiltered scope, exact ordinary list and every unresolved row", () => {
  const ordinary = Array.from({ length: 120 }, (_, index) => `private-post-${index}`);
  const unresolved = ordinary.slice(0, 96);
  const context = { projectId: "project", postId: ordinary[0] };
  const query = (ids, queryKey = ["feedback", "project"]) => ({ queryKey, state: { data: { posts: ids.map((id) => ({ id })) } } });
  const accepted = publishedFeedbackProof(query(ordinary), ordinary, unresolved, context);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.rows, 120); assert.equal(accepted.unresolvedRows, 96);
  assert.ok(!JSON.stringify(accepted).includes("private-post-"));
  const wrong = publishedFeedbackProof(query([...ordinary.slice(0, 119), "foreign"]), ordinary, unresolved, context);
  assert.equal(wrong.accepted, false); assert.equal(wrong.ordinaryResponseIdsMatch, false);
  const missing = publishedFeedbackProof(query(ordinary.filter((id) => id !== unresolved[30])), ordinary, unresolved, context);
  assert.equal(missing.accepted, false); assert.equal(missing.unresolvedIdsIncluded, false);
  assert.equal(publishedFeedbackProof(query(ordinary), ordinary, unresolved, { projectId: "project", postId: null }).accepted, false);
  assert.equal(publishedFeedbackProof(query(ordinary), ordinary, unresolved, { projectId: "project", postId: "foreign" }).accepted, false);
  assert.equal(publishedFeedbackProof(query(ordinary), ordinary, unresolved, { projectId: "other", postId: ordinary[0] }).accepted, false);
  assert.equal(publishedFeedbackProof(query(ordinary, ["feedback", "project", { statuses: ["open"] }]), ordinary, unresolved, context).accepted, false);
});
const root = process.env.MINDDY_PERF_BUILD_ROOT;
if (root) {
  let source;
  for (const name of await readdir(`${root}/.next/static/chunks`)) {
    if (!name.endsWith(".js")) continue;
    const candidate = await readFile(`${root}/.next/static/chunks/${name}`, "utf8");
    if (candidate.includes("persistClient:") && candidate.includes("2097152")) { source = candidate; break; }
  }
  assert.ok(source, "The declared production build must contain its actual persistence closure");
  cases.push({ name: "actual production build", source });
}
for (const { name, source } of cases) {
test(`${name}: evaluates the preflight without returning private query content`, () => {
  const probe = persistenceProbeSource(source, "fixture-build.js");
  assert.ok(probe); assert.match(probe.budgetSourceHash, /^[a-f0-9]{64}$/);
  const evaluate = (data) => {
    const persisted = { timestamp: 1, buster: "v1", clientState: { mutations: [], queries: [{ queryKey: ["issues", "project"], state: { status: "success", data } }] } };
    const context = vm.createContext({ [probe.parameter]: persisted, localStorage: { getItem: () => null }, TextEncoder });
    // Plain data must belong to the evaluated realm, as it does in Chromium.
    vm.runInContext(`${probe.parameter}=JSON.parse(JSON.stringify(${probe.parameter}))`, context);
    return JSON.parse(JSON.stringify(vm.runInContext(metadataExpression(probe, ["project"]), context)));
  };
  const small = evaluate([{ id: "PRIVATE_ID_SENTINEL", description: "PRIVATE_BODY_SENTINEL" }]);
  assert.equal(small.productionFits, true); assert.equal(small.selectedQueries, 1);
  assert.equal(small.queries[0].rows, 1); assert.equal(small.queries[0].scope, "synthetic-project-1");
  assert.ok(!JSON.stringify(small).includes("PRIVATE_"));
  const bytes = evaluate([{ description: "x".repeat(3 * 1024 * 1024) }]);
  assert.equal(bytes.productionFits, false); assert.equal(bytes.fitsWithoutByteLimit, true);
  assert.ok(bytes.boundedFullTraversal.estimatedBytes > 2 * 1024 * 1024);
  const values = evaluate(Array.from({ length: 110000 }, () => null));
  assert.equal(values.productionFits, false); assert.equal(values.fitsWithoutByteLimit, false);
  assert.ok(values.boundedFullTraversal.visitedValues > 100000);
  assert.equal(values.boundedFullTraversal.fits, true);
});

test(`${name}: inspects wire values without exposing row identities and locates the restored freshness predicate`, () => {
  const probe = persistenceProbeSource(source, "fixture-build.js");
  assert.ok(probe.restore);
  assert.match(restoreMetadataExpression(probe, ["project"]), /refetchType:"active"/);
  const queryHash = '["issues","project"]';
  const value = { timestamp: 1, buster: "v1", clientState: { mutations: [], queries: [{
    queryHash, queryKey: ["issues", "project"], state: { status: "success", data: [
      { id: "PRIVATE_SECOND_ID", description: "PRIVATE_DESCRIPTION" }, { id: "PRIVATE_FIRST_ID" },
    ] },
  }] } };
  const metadata = snapshotWireMetadata(probe, JSON.stringify({ operation: "seal", slot: "query-cache", value }), ["project"]);
  assert.equal(metadata.productionFits, true);
  assert.equal(metadata.queries[0].rows, 2);
  assert.equal(metadata.queries[0].identitySha256, digest(queryHash));
  assert.equal(metadata.queries[0].rowIdsSha256, digest(JSON.stringify(["PRIVATE_FIRST_ID", "PRIVATE_SECOND_ID"])));
  assert.ok(!JSON.stringify(metadata).includes("PRIVATE_"));
  assert.ok(!JSON.stringify(metadata).includes(queryHash));
});


test(`${name}: rejects accessors and exotic objects without invoking private getters`, () => {
  const probe = persistenceProbeSource(source, "fixture-build.js");
  const result = vm.runInNewContext(`(()=>{let calls=0;const guard=(${probe.budgetSource});
    const accessor={};Object.defineProperty(accessor,"secret",{enumerable:true,get(){calls++;throw Error("PRIVATE_GETTER")}});
    return{accessor:guard(accessor),exotic:guard(new Date()),calls};})()`);
  assert.equal(result.accessor, false);
  assert.equal(result.exotic, false);
  assert.equal(result.calls, 0);
});
}

test("rejects executable or oversized project identifiers before expression construction", () => {
  const probe = persistenceProbeSource(cases[0].source, "fixture-build.js");
  for (const projects of [["project\";throw Error('injected');//"], ["project\n"], ["${injected}"], ["x".repeat(65)], Array(7).fill("project")]) {
    assert.throws(() => metadataExpression(probe, projects));
    assert.throws(() => restoreMetadataExpression(probe, projects));
  }
});
