import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";

// Compare the installed TanStack subscription with the application subscription.
// No backend, browser, network request, storage write, or account is involved.
const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../../lib/query-persistence.ts", import.meta.url))],
  bundle: true,
  packages: "external",
  platform: "node",
  format: "cjs",
  write: false,
});
const module = { exports: {} };
runInNewContext(compiled.outputFiles[0].text, {
  module,
  exports: module.exports,
  require: createRequire(import.meta.url),
  setTimeout,
  clearTimeout,
});
const { subscribeToQueryPersistence } = module.exports;

const fixture = {
  projects: 6,
  issuesPerProject: 100,
  commentThreads: 180,
  commentsPerThread: 10,
  pagesPerProject: 20,
  blocksPerPage: 80,
  excludedPollUpdates: 300,
  commentEdits: 100,
};

function measure(mode) {
  const queryClient = new QueryClient();
  for (let project = 0; project < fixture.projects; project++) {
    queryClient.setQueryData(["issues", project],
      Array.from({ length: fixture.issuesPerProject }, (_, issue) => ({
        id: `${project}-${issue}`,
        title: `Issue ${issue}`,
        description: "Daily work context. ".repeat(100),
      })),
    );
  }
  for (let thread = 0; thread < fixture.commentThreads; thread++) {
    queryClient.setQueryData(["comments", thread],
      Array.from({ length: fixture.commentsPerThread }, (_, comment) => ({
        id: comment,
        body: "Comment details. ".repeat(20),
      })),
    );
  }
  for (let project = 0; project < fixture.projects; project++) {
    const pages = Array.from({ length: fixture.pagesPerProject }, (_, page) => ({
      id: `${project}-${page}`,
      title: `Page ${project}.${page}`,
    }));
    queryClient.setQueryData(["pages", project], pages);
    for (const page of pages) {
      queryClient.setQueryData(["page", page.id], {
        ...page,
        content: Array.from({ length: fixture.blocksPerPage }, () => ({
          type: "paragraph",
          content: [{ type: "text", text: "Documentation content. ".repeat(20) }],
        })),
      });
    }
  }

  let snapshots = 0;
  let scans = 0;
  const cache = queryClient.getQueryCache();
  const getAll = cache.getAll.bind(cache);
  cache.getAll = () => { scans++; return getAll(); };
  const shouldPersistQuery = (query) =>
    query.state.status === "success" &&
    query.queryKey[0] !== "agent-active-issues" && query.queryKey[0] !== "page";
  const options = {
    queryClient,
    // The no-op storage isolates dehydration and subscription work. The number
    // of prepared snapshots is not a count of physical localStorage writes.
    persister: {
      persistClient: () => { snapshots++; },
      restoreClient: () => undefined,
      removeClient: () => {},
    },
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  };
  const subscription = mode === "before"
    ? persistQueryClientSubscribe(options)
    : subscribeToQueryPersistence({ ...options, shouldPersistQuery });
  scans = 0;
  const startedAt = performance.now();
  for (let tick = 0; tick < fixture.excludedPollUpdates; tick++) {
    queryClient.setQueryData(["agent-active-issues", "all"], { tick });
  }
  for (let edit = 0; edit < fixture.commentEdits; edit++) {
    queryClient.setQueryData(["comments", 0], [{ id: 0, body: `Edited ${edit}` }]);
  }
  const interactionMs = performance.now() - startedAt;
  const interactionScans = scans;
  const interactionSnapshots = snapshots;
  if (mode === "after") subscription.flush();
  const result = { interactionMs, interactionScans, interactionSnapshots, totalSnapshots: snapshots };
  if (mode === "before") subscription();
  else subscription.stop();
  queryClient.clear();
  return result;
}

for (let warmup = 0; warmup < 3; warmup++) {
  measure("before");
  measure("after");
}
const results = {};
for (const mode of ["before", "after"]) {
  const runs = Array.from({ length: 10 }, () => measure(mode));
  const durations = runs.map((run) => run.interactionMs).sort((a, b) => a - b);
  const { interactionMs: _, ...counts } = runs[0];
  results[mode] = {
    ...counts,
    interactionMsMedian: durations[Math.floor(durations.length / 2)],
    interactionMsMax: durations.at(-1),
  };
}
console.log(JSON.stringify({
  kind: "in-memory cache bookkeeping microbenchmark",
  node: process.version,
  fixture,
  warmups: 3,
  runs: 10,
  results,
}, null, 2));
