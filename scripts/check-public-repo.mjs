#!/usr/bin/env node

/**
 * Barrière de publication : ce dépôt est destiné à devenir public. Les chemins
 * locaux et documents internes ci-dessous ne doivent donc jamais être suivis.
 *
 * Sans option, la vérification lit tout l'index (CI). Avec `--staged`, elle ne
 * lit que les ajouts et modifications prêts à être commités, pour un hook local.
 */
import { execFileSync } from "node:child_process";
import { extname } from "node:path";

const staged = process.argv.includes("--staged");
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".sh", ".ts", ".tsx", ".txt", ".yml", ".yaml"]);
const fixturePath = /(?:^|\/)(?:fixtures?|__tests__)(?:\/|$)|\.test\.[cm]?[jt]sx?$/;
const forbiddenPaths = [
  /^\.claude\/settings\.json$/,
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
];

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
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

  // Les tests et l'outil de validation manipulent volontairement des chaînes
  // factices ressemblant à des secrets. Ils vérifient précisément que le code
  // applicatif les masque ; la barrière n'a pas à rejeter ses propres fixtures.
  if (fixturePath.test(path) || path === "scripts/extract-apns-secret.mjs") {
    continue;
  }

  // L'index est le contenu publié par la CI comme celui qui sera committé par
  // un hook local ; ne jamais relire HEAD, qui peut encore contenir un fichier
  // que l'on vient justement de retirer.
  const text = git(["show", `:${path}`]);

  for (const rule of forbiddenContent) {
    if (rule.matches(path, text)) failures.push(`${path}: ${rule.label}`);
  }
}

if (failures.length) {
  console.error("Le dépôt public ne peut pas contenir :");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Public repository check passed (${paths.length} fichiers${staged ? " indexés" : " suivis"}).`);
