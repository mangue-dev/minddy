import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const projectId = "00000000-0000-4000-8000-000000000001";

async function probe(configPath, ...args) {
  const child = spawn(process.execPath,
    ["scripts/encryption-preactivation-probe.mjs", configPath, ...args],
    { env: { ...process.env, MINDDY_BENCHMARK_COOKIE: "fixture-session" } });
  let stdout = "", stderr = "";
  for await (const chunk of child.stdout) stdout += chunk;
  for await (const chunk of child.stderr) stderr += chunk;
  const status = await new Promise((resolve) => child.on("close", resolve));
  return { status, stdout, stderr };
}

test("the probe honors a nonmember 404 and requires exact ordered excerpts", async () => {
  const server = createServer((request, response) => {
    const search = new URL(request.url, "http://localhost").searchParams.get("q");
    const nonmember = search === "private" || search === "leaky";
    response.writeHead(nonmember ? 404 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify(search === "leaky"
      ? { error: "Not found", hits: [{ id: "private" }] }
      : nonmember ? { error: "Not found" } : [
      { id: "a", excerpt: "First hit" }, { id: "b", excerpt: "Second hit" },
    ]));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const directory = await mkdtemp(join(tmpdir(), "min591-probe-"));
  const path = join(directory, "oracle.json");
  const base = { baseUrl: `http://127.0.0.1:${server.address().port}`,
    projectId };
  try {
    await writeFile(path, JSON.stringify({ ...base, queries: [{ text: "private",
      expectedStatus: 404, expectedIds: [], expectedExcerpts: [] }] }));
    const denied = await probe(path, "search", "1", "1", "cold", "0");
    assert.equal(denied.status, 0, denied.stderr);
    assert.equal(JSON.parse(denied.stdout).failures.length, 0);
    assert.match((await probe(path, "search", "1", "1", "cold")).stderr,
      /explicit query index/);
    await writeFile(path, JSON.stringify({ ...base, queries: [{ text: "private",
      expectedStatus: 404, expectedIds: ["private"], expectedExcerpts: ["secret"] }] }));
    assert.match((await probe(path, "search", "1", "1", "cold", "0")).stderr,
      /expectedStatus/);
    await writeFile(path, JSON.stringify({ ...base, queries: [{ text: "leaky",
      expectedStatus: 404, expectedIds: [], expectedExcerpts: [] }] }));
    assert.equal((await probe(path, "search", "1", "1", "cold", "0")).status, 1);

    await writeFile(path, JSON.stringify({ ...base, queries: [{ text: "visible",
      expectedStatus: 200, expectedIds: ["a", "b"],
      expectedExcerpts: ["First hit", "Second hit"] }] }));
    assert.equal((await probe(path, "search", "1", "1", "cold", "0")).status, 0);
    await writeFile(path, JSON.stringify({ ...base, queries: [{ text: "visible",
      expectedStatus: 200, expectedIds: ["b", "a"],
      expectedExcerpts: ["Second hit", "First hit"] }] }));
    assert.equal((await probe(path, "search", "1", "1", "cold", "0")).status, 1);
    await writeFile(path, JSON.stringify({ ...base, queries: [{ text: "visible",
      expectedStatus: 200, expectedIds: ["a", "b"] }] }));
    assert.match((await probe(path, "search", "1", "1", "cold", "0")).stderr,
      /expectedExcerpts/);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
