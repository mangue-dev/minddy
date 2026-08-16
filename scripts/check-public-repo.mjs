#!/usr/bin/env node

/**
 * Barrière de publication : ce dépôt est destiné à devenir public. Les chemins
 * locaux et documents internes ci-dessous ne doivent donc jamais être suivis.
 *
 * Sans option, la vérification lit tout l'index (CI). Avec `--staged`, elle ne
 * lit que les ajouts et modifications prêts à être commités, pour un hook local.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { extname } from "node:path";

const staged = process.argv.includes("--staged");
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".sh", ".ts", ".tsx", ".txt", ".yml", ".yaml"]);
const fixturePath = /(?:^|\/)(?:fixtures?|__tests__)(?:\/|$)|\.test\.[cm]?[jt]sx?$/;
const forbiddenPaths = [
  /^\.claude\/settings\.json$/,
  /^\.claude\/launch\.json$/,
  /^captures\/world\/world\.md$/,
  /^dev\.log$/,
  /^problems\.md$/,
  /^tsconfig\.tsbuildinfo$/,
  /^copy-audit.*\.(?:json|md)$/,
  /^[^/]+-plan\.md$/,
  /^desktop\/dist\//,
  /^docs\/audits\/securite-2026-08-05\.md$/,
  /^docs\/desktop-signing\.md$/,
  /^docs\/rgpd\/registre-des-traitements\.md$/,
];

const forbiddenContent = [
  {
    label: "identifiant de compte par défaut dans le script de seed",
    matches: (path, text) => path === "scripts/seed-inbox.mjs" && /DEFAULT_USER_ID\s*=/.test(text),
  },
  {
    label: "clé privée",
    matches: (_path, text) => /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/.test(text),
  },
  {
    label: "jeton GitHub",
    matches: (_path, text) => /\bgh[pousr]_[A-Za-z0-9]{36,}\b/.test(text),
  },
  {
    label: "clé API OpenAI",
    matches: (_path, text) => [...text.matchAll(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g)]
      .some((match) => !match[0].includes("PLACEHOLDER")),
  },
  {
    label: "clé API Anthropic",
    matches: (_path, text) => /\bsk-ant-[A-Za-z0-9_-]{20,}\b/.test(text),
  },
  {
    label: "jeton Slack",
    matches: (_path, text) => /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/.test(text),
  },
  {
    label: "identifiant de clé AWS",
    matches: (_path, text) => /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text),
  },
  {
    label: "clé API Google",
    matches: (_path, text) => /\bAIza[0-9A-Za-z_-]{35}\b/.test(text),
  },
];

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function checkedGit(args, input) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    input,
    encoding: null,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString("utf8") || `git ${args.join(" ")} a échoué`);
  }
  return result.stdout;
}

function scanText(path, text, failures, prefix = "") {
  if (fixturePath.test(path) || path === "scripts/extract-apns-secret.mjs") return;
  for (const rule of forbiddenContent) {
    if (rule.matches(path, text)) failures.push(`${prefix}${path}: ${rule.label}`);
  }
}

/**
 * Analyse chaque blob atteignable depuis une ref (branches, tags et remotes
 * suivies). Cela détecte un secret retiré de HEAD mais encore présent dans un
 * commit qui serait rendu public. Les objets inaccessibles ne sont pas poussés
 * par Git : la procédure de purge est documentée dans l'audit de publication.
 */
function scanReachableHistory(failures) {
  const entries = git(["rev-list", "--objects", "--all"])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(" ");
      return separator === -1 ? [line, "<objet Git sans chemin>"] : [line.slice(0, separator), line.slice(separator + 1)];
    });
  const pathByObject = new Map(entries);
  for (const path of new Set(pathByObject.values())) {
    if (forbiddenPaths.some((pattern) => pattern.test(path))) {
      failures.push(`historique ${path}: chemin interne interdit`);
    }
  }
  const objectIds = [...pathByObject.keys()];
  const metadata = checkedGit(["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], `${objectIds.join("\n")}\n`)
    .toString("utf8")
    .trim()
    .split("\n");
  const blobIds = metadata
    .map((line) => line.split(" "))
    .filter(([, type]) => type === "blob")
    .map(([id]) => id);
  const batch = checkedGit(["cat-file", "--batch"], `${blobIds.join("\n")}\n`);
  let offset = 0;

  while (offset < batch.length) {
    const lineEnd = batch.indexOf(0x0a, offset);
    if (lineEnd === -1) throw new Error("réponse incomplète de git cat-file --batch");
    const [id, type, rawSize] = batch.subarray(offset, lineEnd).toString("utf8").split(" ");
    const size = Number(rawSize);
    offset = lineEnd + 1;
    if (type !== "blob" || !Number.isSafeInteger(size) || offset + size > batch.length) {
      throw new Error(`réponse invalide de git cat-file pour ${id}`);
    }
    const body = batch.subarray(offset, offset + size);
    offset += size + 1; // git ajoute un saut de ligne après chaque blob.
    if (body.includes(0x00) || size > 5 * 1024 * 1024) continue;
    scanText(pathByObject.get(id) ?? "<chemin historique inconnu>", body.toString("utf8"), failures, "historique ");
  }
  return { objects: objectIds.length, blobs: blobIds.length };
}

const rawPaths = staged
  ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
  : git(["ls-files", "-z"]);
const paths = rawPaths.split("\0").filter(Boolean);
const failures = [];

for (const path of paths) {
  if (forbiddenPaths.some((pattern) => pattern.test(path))) {
    failures.push(`${path}: chemin interne interdit`);
    continue;
  }

  // Les règles de contenu visent des sources et documents. Lire les captures
  // binaires serait lent, inutile, et peut dépasser le tampon de Node.
  if (!textExtensions.has(extname(path))) {
    continue;
  }

  // L'index est le contenu publié par la CI comme celui qui sera committé par
  // un hook local ; ne jamais relire HEAD, qui peut encore contenir un fichier
  // que l'on vient justement de retirer.
  const text = git(["show", `:${path}`]);

  scanText(path, text, failures);
}

const history = staged ? null : scanReachableHistory(failures);

if (failures.length) {
  console.error("Le dépôt public ne peut pas contenir :");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Public repository check passed (${paths.length} fichiers${staged ? " indexés" : " suivis"}${history ? `, ${history.blobs} blobs dans ${history.objects} objets Git atteignables` : ""}).`);
