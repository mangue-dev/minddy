#!/usr/bin/env node

/**
 * Check owned repository prose for accidental French text.
 *
 * This is intentionally a small heuristic rather than a language detector: it
 * catches accented French and common French function words while leaving
 * localized assets and locale fixture paths alone. It never rewrites files.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredPaths = [
  /^messages\/fr\.json$/,
  /^\.claude\//,
  /(^|\/)(?:LICENSE|NOTICE)(?:\.|$)/,
  /^scripts\/check-owned-english\.mjs$/,
  /^captures\/.*\/history\.jsonl$/,
  /^supabase\/email-templates\//,
  /^lib\/server\/agent\/tool-feed-labels\.test\.ts$/,
  /^lib\/server\/assistant\/tool-feed-labels\.test\.ts$/,
  /^lib\/settings-sections\.ts$/,
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)\.pnpm-store\//,
  /(^|\/)(?:package-lock|pnpm-lock)\.yaml$/,
  /(^|\/)(?:package-lock|npm-shrinkwrap)\.json$/,
  /^desktop\/release\//,
  /^desktop\/build\/fr\.lproj\//,
  /^captures\/.*\/out\//,
];
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".plist",
  ".sh",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".toml",
  ".txt",
  ".yml",
  ".yaml",
]);
const frenchPattern = /(?:[àâçéèêëîïôùûüÿœæÀÂÇÉÈÊËÎÏÔÙÛÜŸŒÆ]|\b(?:alors|aucun(?:e|s)?|avec|avant|annuler|dans|déjà|déploiement|données|erreur|français|française|lancer|projet|projets|réessayer|réussi|sécurité|sous-traitant(?:s)?|succès|tâche(?:s)?|tous|toutes|utilisateur(?:s)?|vérifier|vous|vue|équipe)\b)/i;

// These are intentional French tokens in otherwise English-owned prose: proper
// names, paths/identifiers, and fixtures that explicitly test localization or
// accented filenames. They are kept visible so the checker does not encourage
// changing behavior or test data merely to make the heuristic green.
const intentionalFrenchPattern = /Clément|sautéed|façade|Décor|Terminé|Annulé|Réinitialisez|Édition|Détail|“É”|Règles du web|quand … si … alors|19 juil\.|1 août|arrivée|départ|Réparer|<clé>|<CLÉ>|<prénom nom>|nœud|été|Projets|projet(?:-\w+)?\.mjs|éditeur\/famille-latest|fichier à espaces\.md|`[^`]*(?:projet|clé|CLÉ|dépôt)[^`]*`/u;

function isDocumentationLine(file, line, inBlockComment) {
  const extension = path.extname(file);
  if (extension === ".md" || extension === ".txt") return true;
  if (extension === ".sql" && /\bCOMMENT\s+ON\b/iu.test(line)) return true;
  if (inBlockComment) return true;
  if (/^\s*(?:\/\/|\/\*|\*|<!--|--)/u.test(line)) return true;
  if ([".env", ".sh", ".toml", ".yml", ".yaml"].includes(extension)) {
    return /^\s*#/u.test(line);
  }
  return false;
}

function commentLineNumbers(file, contents) {
  const extension = path.extname(file);
  if (extension === ".md" || extension === ".txt") {
    return new Set(contents.split("\n").map((_, index) => index));
  }

  const lines = contents.split("\n");
  const result = new Set();
  let state = "code";
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (isDocumentationLine(file, line, state === "block")) result.add(lineIndex);
    let sawBlockComment = state === "block";
    for (let index = 0; index < line.length; index += 1) {
      const current = line[index];
      const next = line[index + 1];
      if (state === "block") {
        sawBlockComment = true;
        if (current === "*" && next === "/") {
          state = "code";
          index += 1;
        }
        continue;
      }
      if (state === "single" || state === "double" || state === "template") {
        if (current === "\\") {
          index += 1;
        } else if (
          (state === "single" && current === "'") ||
          (state === "double" && current === '"') ||
          (state === "template" && current === "`")
        ) {
          state = "code";
        }
        continue;
      }
      if (current === "/" && next === "*") {
        state = "block";
        sawBlockComment = true;
        index += 1;
      } else if (current === "/" && next === "/") {
        result.add(lineIndex);
        break;
      } else if (current === "'") {
        state = "single";
      } else if (current === '"') {
        state = "double";
      } else if (current === "`") {
        state = "template";
      }
    }
    if (state === "block" || sawBlockComment) result.add(lineIndex);
  }
  return result;
}

function isIgnored(file) {
  return ignoredPaths.some((pattern) => pattern.test(file));
}

function listFiles() {
  const output = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root });
  return output
    .toString()
    .split("\0")
    .filter(Boolean)
    .filter((file) => !isIgnored(file))
    .filter((file) => textExtensions.has(path.extname(file)) || file === ".env.example");
}

const findings = [];
for (const file of listFiles()) {
  let contents;
  try {
    contents = readFileSync(path.join(root, file), "utf8");
  } catch {
    continue;
  }
  const commentLines = commentLineNumbers(file, contents);
  contents.split("\n").forEach((line, index) => {
    const shouldCheck = commentLines.has(index);
    if (
      shouldCheck &&
      frenchPattern.test(line) &&
      !intentionalFrenchPattern.test(line) &&
      !/Clément Guérin|mangué|Léa Marchand|"french"\s*:/u.test(line)
    ) {
      findings.push(`${file}:${index + 1}: ${line}`);
    }
  });
}

if (findings.length > 0) {
  console.error(`Owned English check found ${findings.length} possible French line(s):`);
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Owned English check passed: no likely French prose found in owned text files.");
}
