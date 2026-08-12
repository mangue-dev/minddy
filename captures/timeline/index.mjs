#!/usr/bin/env node
// Frise des captures — outil local, pour regarder l'interface de minddy bouger.
//
// Croise deux historiques qui ne se superposent pas :
//   - git, qui dit à quoi l'image ressemblait ;
//   - history.jsonl, qui dit pourquoi elle a été refaite.
//
// Rien n'est écrit dans le dépôt : les blobs extraits et les mesures vont dans
// .cache/, ignoré par git. Relancer après chaque capture, l'index se recalcule
// (seuls les blobs nouveaux sont mesurés).

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
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

// Les dossiers dont un commit signifie « le produit a bougé ». Sert à dire de
// combien de commits une capture est en retard sur l'interface réelle.
const PRODUCT_PATHS = ["app", "components", "lib"];

// Largeur de travail du diff de pixels. Comparer 3472×2170 en pleine
// résolution coûte des secondes par paire pour un chiffre identique à 0,1 %
// près : on redescend, on compare, on garde le pourcentage.
const DIFF_WIDTH = 480;
// En dessous de ce delta sur un canal, c'est du ré-encodage ou de
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

/** Toutes les images suivies par git sous captures/shots/<nom>/out/. */
async function listImages() {
  const out = await git(["ls-files", "captures/shots/*/out/*.png"]);
  return out.split("\n").filter(Boolean).sort();
}

/**
 * L'historique d'un fichier, de la version la plus récente à la plus ancienne.
 * --follow suit les renommages ; on lit le chemin tel qu'il était à chaque
 * commit, sans quoi rev-parse échouerait sur les versions d'avant le renommage.
 */
async function fileHistory(path) {
  const out = await git([
    "log",
    "--follow",
    "--name-status",
    "--date=iso-strict",
    // \x1e sépare les commits, \x1f les champs. Pas \x00 : Node refuse
    // l'octet nul dans un argument de process.
    "--format=\x1e%H\x1f%aI\x1f%s\x1f%an",
    "--",
    path,
  ]);

  const versions = [];
  for (const chunk of out.split("\x1e").slice(1)) {
    const [header, ...rest] = chunk.split("\n");
    const [sha, date, subject, author] = header.split("\x1f");
    // La dernière colonne d'une ligne --name-status est le chemin à ce commit.
    const line = rest.find((l) => l.trim() && /^[A-Z]\d*\t/.test(l));
    const pathAtCommit = line ? line.split("\t").pop().trim() : path;
    versions.push({ sha, date, subject, author, pathAtCommit });
  }
  return versions;
}

/** Le blob d'un chemin à un commit donné, ou null si absent. */
async function blobAt(sha, path) {
  try {
    return (await git(["rev-parse", `${sha}:${path}`])).trim();
  } catch {
    return null;
  }
}

/** Les fichiers modifiés dans l'arbre de travail, non commités. */
async function dirtyFiles() {
  const out = await git(["status", "--porcelain", "--", "captures/shots"]);
  const dirty = new Set();
  for (const line of out.split("\n").filter(Boolean)) {
    const path = line.slice(3).trim();
    if (path.endsWith(".png")) dirty.add(path);
  }
  return dirty;
}

/** Combien de commits produit séparent ce commit de HEAD. */
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
      /* cache illisible : on repart de zéro, ce n'est que du dérivé */
    }
  }
}

async function saveMeta() {
  await writeFile(META, JSON.stringify(meta));
}

function blobPath(id) {
  return join(BLOBS, `${id}.png`);
}

/** Matérialise un blob git dans le cache. Renvoie son chemin sur disque. */
async function materialize(id, { fromWorktree } = {}) {
  const dest = blobPath(id);
  if (existsSync(dest)) return dest;
  const buf = fromWorktree
    ? await readFile(join(REPO, fromWorktree))
    : await gitBuffer(["cat-file", "blob", id]);
  await writeFile(dest, buf);
  return dest;
}

/** Dimensions et poids d'un blob, mesurés une fois pour toutes. */
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
 * Les deux images sont ramenées à la même boîte avant comparaison. Quand le
 * cadrage change (hero-board est passé de 1440×900 à 1736×1085), l'étirement
 * rend le chiffre peu parlant : on le signale plutôt que de le taire.
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

/** Le journal des runs d'une capture, du plus ancien au plus récent. */
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
      /* une ligne cassée ne doit pas emporter le journal */
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

    // La version de l'arbre de travail, si elle diffère du dernier commit.
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
      // Deux commits peuvent porter le même blob : la capture a été relancée
      // et a rendu exactement la même image. Ce n'est pas une version de plus.
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

    // Mesures dérivées, de la plus récente à la plus ancienne.
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

/** Ce qui se dit d'une capture sans ouvrir ses variantes. */
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

  // Les viewports traversés, dans l'ordre où ils apparaissent au journal.
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
      // Rebâti à la demande : on relance l'outil après une capture, et
      // l'index doit dire l'état du dépôt maintenant, pas au démarrage.
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
