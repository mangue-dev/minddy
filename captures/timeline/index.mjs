#!/usr/bin/env node
// Capture timeline — local tool, to watch Minddy's interface move.
//
// Croise deux historiques qui ne se superposent pas :
// - git, which says what the image looked like;
// - history.jsonl, which says why it was redone.
//
// Nothing is written in the repository: the extracted blobs and the measurements go into
// .cache/, ignored by git. Relaunch after each capture, the index is recalculated
// (only new blobs are measured).

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import sharp from "sharp";

const exec = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CACHE = join(HERE, ".cache");
const BLOBS = join(CACHE, "blobs");
const META = join(CACHE, "meta.json");
const PUBLIC = join(HERE, "public");

const PORT = Number(process.env.PORT ?? 4321);

// Files where a commit means “the product has moved”. Used to say
// how many commits a capture is behind the actual interface.
const PRODUCT_PATHS = ["app", "components", "lib"];

// Largeur de travail du diff de pixels. Comparer 3472×2170 en pleine
// resolution costs seconds per pair for a figure identical to 0.1%
// close: we go back down, we compare, we keep the percentage.
const DIFF_WIDTH = 480;
// Below this delta on a channel, it is re-encoding or
// l'antialiasing, pas un changement d'interface.
const DIFF_THRESHOLD = 12;

// ---------------------------------------------------------------- git

async function git(args, opts = {}) {
  const { stdout } = await exec("git", args, {
    cwd: REPO,
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  return stdout;
}

async function gitBuffer(args) {
  const { stdout } = await exec("git", args, {
    cwd: REPO,
    maxBuffer: 256 * 1024 * 1024,
    encoding: "buffer",
  });
  return stdout;
}

/** All images tracked by git under captures/shots/<nom>/out/. */
async function listImages() {
  const out = await git(["ls-files", "captures/shots/*/out/*.png"]);
  return out.split("\n").filter(Boolean).sort();
}

/**
 * The history of a file, from the most recent version to the oldest.
 * --follow follows renames; we read the path as it was at each
 * commit, otherwise rev-parse would fail on versions before the renaming.
 */
async function fileHistory(path) {
  const out = await git([
    "log",
    "--follow",
    "--name-status",
    "--date=iso-strict",
    // \x1e separates commits, \x1f fields. Not \x00: Node refuses
    // the null byte in a process argument.
    "--format=\x1e%H\x1f%aI\x1f%s\x1f%an",
    "--",
    path,
  ]);

  const versions = [];
  for (const chunk of out.split("\x1e").slice(1)) {
    const [header, ...rest] = chunk.split("\n");
    const [sha, date, subject, author] = header.split("\x1f");
    // The last column of a --name-status line is the path to that commit.
    const line = rest.find((l) => l.trim() && /^[A-Z]\d*\t/.test(l));
    const pathAtCommit = line ? line.split("\t").pop().trim() : path;
    versions.push({ sha, date, subject, author, pathAtCommit });
  }
  return versions;
}

/** The blob of a path to a given commit, or null if absent. */
async function blobAt(sha, path) {
  try {
    return (await git(["rev-parse", `${sha}:${path}`])).trim();
  } catch {
    return null;
  }
}

/** Modified files in the working tree, not committed. */
async function dirtyFiles() {
  const out = await git(["status", "--porcelain", "--", "captures/shots"]);
  const dirty = new Set();
  for (const line of out.split("\n").filter(Boolean)) {
    const path = line.slice(3).trim();
    if (path.endsWith(".png")) dirty.add(path);
  }
  return dirty;
}

/** How many product commits separate this commit from HEAD. */
const behindCache = new Map();
async function commitsBehind(sha) {
  if (behindCache.has(sha)) return behindCache.get(sha);
  const out = await git([
    "rev-list",
    "--count",
    `${sha}..HEAD`,
    "--",
    ...PRODUCT_PATHS,
  ]);
  const n = Number(out.trim());
  behindCache.set(sha, n);
  return n;
}

// ---------------------------------------------------------------- cache

let meta = { blobs: {}, diffs: {} };

async function loadMeta() {
  await mkdir(BLOBS, { recursive: true });
  if (existsSync(META)) {
    try {
      meta = JSON.parse(await readFile(META, "utf8"));
      meta.blobs ??= {};
      meta.diffs ??= {};
    } catch {
      /* unreadable cache: we start from scratch, it's just a derivative */
    }
  }
}

async function saveMeta() {
  await writeFile(META, JSON.stringify(meta));
}

function blobPath(id) {
  return join(BLOBS, `${id}.png`);
}

/** Materializes a git blob in the cache. Returns its path to disk. */
async function materialize(id, { fromWorktree } = {}) {
  const dest = blobPath(id);
  if (existsSync(dest)) return dest;
  const buf = fromWorktree
    ? await readFile(join(REPO, fromWorktree))
    : await gitBuffer(["cat-file", "blob", id]);
  await writeFile(dest, buf);
  return dest;
}

/** Dimensions and weight of a blob, measured once and for all. */
async function measure(id) {
  if (meta.blobs[id]) return meta.blobs[id];
  const file = blobPath(id);
  const [{ width, height }, { size }] = await Promise.all([
    sharp(file).metadata(),
    stat(file),
  ]);
  meta.blobs[id] = { width, height, bytes: size };
  return meta.blobs[id];
}

/**
 * Part des pixels qui changent entre deux versions.
 *
 * The two images are brought back to the same box before comparison. When the
 * framing changes (hero-board went from 1440×900 to 1736×1085), stretching
 * makes the figure not very meaningful: we point it out rather than keeping it quiet.
 */
async function diff(a, b) {
  const key = `${a}:${b}`;
  if (meta.diffs[key]) return meta.diffs[key];

  const [ma, mb] = await Promise.all([measure(a), measure(b)]);
  const aspectChanged =
    Math.abs(ma.width / ma.height - mb.width / mb.height) > 0.01;
  const height = Math.round(DIFF_WIDTH * (ma.height / ma.width));

  const raw = (id) =>
    sharp(blobPath(id))
      .resize(DIFF_WIDTH, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();

  const [ba, bb] = await Promise.all([raw(a), raw(b)]);

  let changed = 0;
  const pixels = DIFF_WIDTH * height;
  for (let i = 0; i < ba.length; i += 3) {
    const d = Math.max(
      Math.abs(ba[i] - bb[i]),
      Math.abs(ba[i + 1] - bb[i + 1]),
      Math.abs(ba[i + 2] - bb[i + 2]),
    );
    if (d > DIFF_THRESHOLD) changed++;
  }

  meta.diffs[key] = {
    pct: Math.round((changed / pixels) * 1000) / 10,
    aspectChanged,
  };
  return meta.diffs[key];
}

// ---------------------------------------------------------------- history.jsonl

/** The run log of a capture, from oldest to most recent. */
async function runLog(shot) {
  const file = join(REPO, "captures", "shots", shot, "history.jsonl");
  if (!existsSync(file)) return [];
  const text = await readFile(file, "utf8");
  const runs = [];
  for (const [i, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      runs.push({ line: i + 1, ...JSON.parse(line) });
    } catch {
      /* a broken line should not take away the log */
    }
  }
  return runs;
}

// ---------------------------------------------------------------- index

function parseImagePath(path) {
  const m = path.match(/^captures\/shots\/([^/]+)\/out\/([^/]+)\.png$/);
  if (!m) return null;
  const [, shot, variant] = m;
  const [lang, theme] = variant.split("-");
  return { shot, variant, lang, theme };
}

let indexPromise = null;

async function buildIndex() {
  const t0 = Date.now();
  await loadMeta();

  const images = await listImages();
  const dirty = await dirtyFiles();
  const shots = new Map();

  let measured = 0;

  for (const path of images) {
    const parsed = parseImagePath(path);
    if (!parsed) continue;

    const history = await fileHistory(path);
    const versions = [];

    // The working tree version, if different from the last commit.
    if (dirty.has(path)) {
      const id = (await git(["hash-object", path])).trim();
      await materialize(id, { fromWorktree: path });
      await measure(id);
      versions.push({
        blob: id,
        sha: null,
        date: (await stat(join(REPO, path))).mtime.toISOString(),
        subject: "Travail en cours (non commité)",
        author: null,
        pending: true,
      });
    }

    for (const v of history) {
      const id = await blobAt(v.sha, v.pathAtCommit);
      if (!id) continue;
      // Two commits can carry the same blob: the capture has been restarted
      // and rendered exactly the same image. This is not another version.
      if (versions.some((x) => x.blob === id)) continue;
      const known = Boolean(meta.blobs[id]);
      await materialize(id);
      await measure(id);
      if (!known) measured++;
      versions.push({
        blob: id,
        sha: v.sha,
        date: v.date,
        subject: v.subject,
        author: v.author,
        pending: false,
      });
    }

    // Derived measurements, from newest to oldest.
    for (const [i, v] of versions.entries()) {
      Object.assign(v, meta.blobs[v.blob]);
      v.behind = v.sha ? await commitsBehind(v.sha) : 0;
      const older = versions[i + 1];
      v.diff = older ? await diff(v.blob, older.blob) : null;
    }

    if (!shots.has(parsed.shot)) {
      shots.set(parsed.shot, {
        name: parsed.shot,
        variants: {},
        runs: await runLog(parsed.shot),
      });
    }
    shots.get(parsed.shot).variants[parsed.variant] = { path, versions };
  }

  await saveMeta();

  const payload = {
    generatedAt: new Date().toISOString(),
    head: (await git(["rev-parse", "--short", "HEAD"])).trim(),
    productCommits: Number(
      (await git(["rev-list", "--count", "HEAD", "--", ...PRODUCT_PATHS])).trim(),
    ),
    shots: [...shots.values()].map(summarizeShot),
    tookMs: Date.now() - t0,
    newlyMeasured: measured,
  };

  return payload;
}

/** What is said about a capture without opening its variants. */
function summarizeShot(shot) {
  const variants = Object.values(shot.variants);
  const reference = shot.variants["en-light"] ?? variants[0];
  const versions = reference?.versions ?? [];
  const latest = versions[0];

  const verdicts = { ok: 0, "à corriger": 0, échec: 0, autre: 0 };
  for (const run of shot.runs) {
    const v = (run.verdict ?? "").toLowerCase().trim();
    if (v === "ok") verdicts.ok++;
    else if (v.startsWith("à corriger") || v.startsWith("a corriger"))
      verdicts["à corriger"]++;
    else if (v.startsWith("échec") || v.startsWith("echec")) verdicts.échec++;
    else verdicts.autre++;
  }

  // Viewports traversed, in the order they appear in the log.
  const viewports = [];
  for (const run of shot.runs) {
    if (run.viewport && !viewports.includes(run.viewport))
      viewports.push(run.viewport);
  }

  return {
    ...shot,
    referenceVariant: reference ? Object.keys(shot.variants).find((k) => shot.variants[k] === reference) : null,
    versionCount: versions.length,
    runCount: shot.runs.length,
    verdicts,
    viewports,
    pending: versions.some((v) => v.pending),
    latest: latest
      ? {
          date: latest.date,
          behind: latest.behind,
          width: latest.width,
          height: latest.height,
          bytes: latest.bytes,
          blob: latest.blob,
          diff: latest.diff,
        }
      : null,
    totalBytes: variants.reduce(
      (sum, v) => sum + (v.versions[0]?.bytes ?? 0),
      0,
    ),
  };
}

// ---------------------------------------------------------------- serveur

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function serveFile(res, file) {
  if (!existsSync(file)) {
    res.writeHead(404).end("introuvable");
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
    "Cache-Control": file.startsWith(BLOBS)
      ? "public, max-age=31536000, immutable" // un blob git ne change jamais
      : "no-store",
  });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (url.pathname === "/api/index") {
      // Rebuilt on demand: we restart the tool after a capture, and
      // the index should tell the repository status now, not at startup.
      if (url.searchParams.get("refresh") === "1" || !indexPromise) {
        behindCache.clear();
        indexPromise = buildIndex();
      }
      const data = await indexPromise;
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
      return;
    }

    if (url.pathname.startsWith("/blob/")) {
      const id = url.pathname.slice("/blob/".length).replace(/\.png$/, "");
      if (!/^[0-9a-f]{40}$/.test(id)) {
        res.writeHead(400).end("blob invalide");
        return;
      }
      serveFile(res, blobPath(id));
      return;
    }

    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (file.includes("..")) {
      res.writeHead(400).end("chemin invalide");
      return;
    }
    serveFile(res, join(PUBLIC, file));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(String(err?.stack ?? err));
  }
});

server.listen(PORT, () => {
  console.log(`\n  Frise des captures  →  http://localhost:${PORT}\n`);
  console.log("  Premier index en cours (extraction des blobs, mesure des diffs)…");
  indexPromise = buildIndex().then((data) => {
    const shots = data.shots.length;
    const versions = data.shots.reduce((n, s) => n + s.versionCount, 0);
    console.log(
      `  Prêt : ${shots} captures, ${versions} versions, ` +
        `${data.newlyMeasured} nouveaux blobs mesurés en ${(data.tookMs / 1000).toFixed(1)} s\n`,
    );
    return data;
  });
});
