import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

const NEXT_DIR = path.resolve(".next");
const APP_SERVER_DIR = path.join(NEXT_DIR, "server", "app", "(app)");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function loadManifest(file) {
  const sandbox = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  return Object.values(sandbox.globalThis.__RSC_MANIFEST ?? {})[0];
}

function routeEntry(manifest) {
  return Object.keys(manifest.entryJSFiles).find(
    (entry) => entry.startsWith("[project]/app/(app)/") && entry.endsWith("/page"),
  );
}

function routeName(entry) {
  return entry?.slice("[project]/app/(app)".length, -"/page".length) ?? "unknown";
}

function sizes(files) {
  let minified = 0;
  let gzip = 0;
  for (const file of new Set(files)) {
    const contents = fs.readFileSync(path.join(NEXT_DIR, file));
    minified += contents.length;
    gzip += zlib.gzipSync(contents).length;
  }
  return {
    minifiedKb: Math.round(minified / 1024),
    gzipKb: Math.round(gzip / 1024),
  };
}

function bundleReport() {
  if (!fs.existsSync(APP_SERVER_DIR)) {
    throw new Error("Missing .next production output. Run `npm run build` first.");
  }

  const manifestFiles = walk(APP_SERVER_DIR).filter((file) =>
    file.endsWith("page_client-reference-manifest.js"),
  );
  const manifests = manifestFiles.map(loadManifest);
  const rows = manifests
    .map((manifest) => {
      const entry = routeEntry(manifest);
      if (!entry) return null;
      const shared = manifest.entryJSFiles["[project]/app/(app)/layout"] ?? [];
      const route = manifest.entryJSFiles[entry] ?? [];
      const sharedSet = new Set(shared);
      const incremental = route.filter((chunk) => !sharedSet.has(chunk));
      const totalSizes = sizes(route);
      const incrementalSizes = sizes(incremental);
      return {
        route: routeName(entry),
        minifiedKb: totalSizes.minifiedKb,
        gzipKb: totalSizes.gzipKb,
        incrementalMinifiedKb: incrementalSizes.minifiedKb,
        incrementalGzipKb: incrementalSizes.gzipKb,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.incrementalGzipKb - a.incrementalGzipKb);

  const shared = sizes(
    manifests[0].entryJSFiles["[project]/app/(app)/layout"] ?? [],
  );
  console.log(
    `Authenticated app shared JS: ${shared.minifiedKb} KB minified, ${shared.gzipKb} KB gzip`,
  );
  console.table(rows);
}

async function liveReport() {
  const { chromium } = await import("playwright");
  const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  let bytes = 0;
  const seen = new Set();

  page.on("response", async (response) => {
    const url = response.url();
    if (seen.has(url) || !url.includes("/_next/static")) return;
    seen.add(url);
    try {
      bytes += (await response.body()).length;
    } catch {
      // A redirected or aborted response has no readable body.
    }
  });

  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  console.log(
    `Login static assets: ${Math.round(bytes / 1024)} KB transferred (uncompressed response bodies)`,
  );
  await browser.close();
}

bundleReport();
if (process.argv.includes("--live")) await liveReport();
