// Read-only server latency of individual authenticated GET routes on the local production
// server, for route-level fixes whose user-visible effect is the first access to a destination.
// Each route gets warm-up requests, then sequential measured requests, so routes never compete.
// Usage: MINDDY_PERF_BASE_URL=https://localhost:3443 node scripts/performance/measure-route-latency.mjs <label> [samples]
import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { openFixture } from "./stable-restored-tabs.mjs";
import { secondaryManifestPath } from "./enrich-secondary-workload.mjs";

const label = process.argv[2] ?? "min683-route-latency";
const samples = Number(process.argv[3] ?? 15);
const session = await openFixture();
const { base, cookies, fixture } = session;
const secondary = JSON.parse(await readFile(secondaryManifestPath, "utf8"));
const project = fixture.projects[0];
const post = secondary.entities.feedback[0].id;
// The project icon route answers from Storage for the fixture's one project with an uploaded icon.
const iconProject = (await session.api("/api/projects")).find((entry) => entry.icon_storage_path)?.id;
const routes = [
  "/api/routines",
  `/api/projects/${project}/views`,
  `/api/projects/${project}/feedback/${post}`,
  `/api/projects/${project}/feedback/${post}/comments`,
  `/api/projects/${project}/feedback/${post}/events`,
  "/api/pull-requests/count",
  "/api/assistant/models",
  "/api/notifications",
  "/api/agent-runs",
  ...(iconProject ? [`/api/projects/${iconProject}/icon/content`] : []),
];
const headers = { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "), "Accept-Encoding": "br" };
// Certificate validation stays on: the local HTTP/2 proxy's self-signed certificate is trusted explicitly.
const tls = base.startsWith("https:") ? { ca: await readFile("output/playwright/performance/h2-proxy-cert/cert.pem") } : {};
const agent = new (base.startsWith("https:") ? https : http).Agent({ keepAlive: true, ...tls });

function time(route) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    (base.startsWith("https:") ? https : http).get(`${base}${route}`, { headers, agent }, (response) => {
      const firstByte = performance.now() - started;
      response.on("data", () => {});
      response.on("end", () => resolve({ status: response.statusCode, firstByte, total: performance.now() - started }));
    }).on("error", reject);
  });
}

const results = {};
for (const route of routes) {
  for (let i = 0; i < 3; i++) await time(route);
  const runs = [];
  for (let i = 0; i < samples; i++) runs.push(await time(route));
  const sorted = runs.map((run) => run.total).sort((a, b) => a - b);
  const key = route.replace(/[0-9a-f-]{36}/g, "{id}");
  results[key] = { statuses: [...new Set(runs.map((run) => run.status))], median: Math.round(sorted[Math.floor(sorted.length / 2)]),
    min: Math.round(sorted[0]), max: Math.round(sorted.at(-1)), samples: runs.map((run) => Math.round(run.total)) };
  console.log(JSON.stringify({ route: key, ...results[key], samples: undefined }));
}
agent.destroy();
await session.close();
await writeFile(`output/playwright/performance/${label}.json`, JSON.stringify({ label, base, samples, results }, null, 2));
