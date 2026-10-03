#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHANGELOG_LOCALES, validateRelease, validateIndex, toIndexEntry } from "./changelog-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const folder = path.join(root, "content/changelog");
const read = async file => JSON.parse(await readFile(path.join(folder, file), "utf8"));
const legacy = await read("legacy.json");
const evidence = await read("backfill-evidence.json");
const dryRun = process.argv.includes("--dry-run");
const verifyGit = process.argv.includes("--verify-git");
if (process.argv.slice(2).some(a => !["--dry-run", "--verify-git"].includes(a))) {
  throw new Error("Usage: node scripts/changelog-backfill.mjs [--dry-run] [--verify-git]");
}
const objects = new Map();
const patches = new Map();
function hasCommit(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("Historical evidence requires full commit SHAs");
  if (!objects.has(sha)) {
    try { execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: root, stdio: "ignore" }); objects.set(sha, true); }
    catch { objects.set(sha, false); }
  }
  return objects.get(sha);
}
function patchId(sha) {
  if (!patches.has(sha)) patches.set(sha, execFileSync("git", ["patch-id", "--stable"], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    // Binary patch IDs hash index object IDs; abbreviations vary with clone size.
    input: execFileSync("git", ["show", "--format=", "--first-parent", "--full-index", "--no-color", sha], { cwd: root, maxBuffer: 64 * 1024 * 1024 }),
  }).split(/\s+/u)[0]);
  return patches.get(sha);
}
const generic = {
  en: ["Maintenance update", "A small maintenance release."],
  fr: ["Mise à jour de maintenance", "Une petite mise à jour de maintenance."],
  de: ["Wartungsupdate", "Ein kleines Wartungsupdate."],
  "pt-BR": ["Atualização de manutenção", "Uma pequena atualização de manutenção."],
  it: ["Aggiornamento di manutenzione", "Un piccolo aggiornamento di manutenzione."],
  es: ["Actualización de mantenimiento", "Una pequeña actualización de mantenimiento."],
};
const archive = {
  en: ["Earlier features, together", "Features already available in this version. Their first production dates could not be recovered."],
  fr: ["Les nouveautés précédentes, réunies", "Ces fonctionnalités étaient déjà disponibles dans cette version. Leurs premières dates de mise en production n’ont pas pu être retrouvées."],
  de: ["Frühere Funktionen im Überblick", "Diese Funktionen waren in dieser Version bereits verfügbar. Ihre ersten Produktionsdaten konnten nicht ermittelt werden."],
  "pt-BR": ["Novidades anteriores, reunidas", "Estas funcionalidades já estavam disponíveis nesta versão. As primeiras datas de publicação não puderam ser recuperadas."],
  it: ["Le novità precedenti, riunite", "Queste funzionalità erano già disponibili in questa versione. Non è stato possibile recuperare le prime date di pubblicazione."],
  es: ["Las novedades anteriores, reunidas", "Estas funciones ya estaban disponibles en esta versión. No se pudieron recuperar sus primeras fechas de publicación."],
};
const headlines = {
  "0.11.0": {
    en: ["A more private, connected workspace", "Encrypted workspace content, one Numo, and more ways to organize your work."],
    fr: ["Un espace plus privé et mieux connecté", "Vos contenus chiffrés, un seul Numo et de nouvelles façons d’organiser votre travail."],
    de: ["Ein privaterer, vernetzter Arbeitsbereich", "Verschlüsselte Inhalte, ein gemeinsamer Numo und neue Möglichkeiten, deine Arbeit zu organisieren."],
    "pt-BR": ["Um espaço mais privado e conectado", "Conteúdo criptografado, um único Numo e mais formas de organizar seu trabalho."],
    it: ["Uno spazio più riservato e connesso", "Contenuti crittografati, un solo Numo e nuovi modi per organizzare il lavoro."],
    es: ["Un espacio más privado y conectado", "Contenido cifrado, un solo Numo y más formas de organizar tu trabajo."],
  },
  "0.10.25": {
    en: ["Pages that work like databases", "Organize your pages, connect Numo to your services, and give your routines more context."],
    fr: ["Vos pages deviennent des bases de données", "Organisez vos pages, connectez Numo à vos services et donnez plus de contexte à vos routines."],
    de: ["Seiten als Datenbanken", "Organisiere deine Seiten, verbinde Numo mit deinen Diensten und gib deinen Routinen mehr Kontext."],
    "pt-BR": ["Páginas que funcionam como bancos de dados", "Organize suas páginas, conecte o Numo aos seus serviços e dê mais contexto às rotinas."],
    it: ["Pagine che diventano database", "Organizza le pagine, collega Numo ai tuoi servizi e dai più contesto alle routine."],
    es: ["Páginas que funcionan como bases de datos", "Organiza tus páginas, conecta Numo a tus servicios y da más contexto a tus rutinas."],
  },
};
function illustration(id) {
  if (/encrypt/.test(id)) return "shield";
  if (/page|resource|attachment|notebook/.test(id)) return "pages";
  if (/desktop|local-agent/.test(id)) return "desktop";
  if (/mcp|connect|provider|api-key|own-ai|sync|depend/.test(id)) return "connections";
  if (/numo|smart|agent|routine|automation|voice/.test(id)) return "assistant";
  if (/stat|activity|momentum|performance/.test(id)) return "activity";
  return "board";
}
const records = [];
for (const deployment of evidence.deployments) {
  const mappings = evidence.mappings.filter(m => m.version === deployment.version);
  for (const m of mappings) {
    // Preserve audited evidence even when rewritten objects disappear from fresh clones.
    if (m.ancestryVerified !== true || !/^[a-f0-9]{40}$/.test(m.stablePatchId ?? "")
      || m.stablePatchId !== m.sourceStablePatchId) throw new Error(`Unverified historical mapping: ${m.id}`);
    const source = m.sourceCommit ?? m.commit;
    const mappedAvailable = hasCommit(m.commit);
    const deploymentAvailable = hasCommit(deployment.sha);
    const sourceAvailable = hasCommit(source);
    if (verifyGit && (!mappedAvailable || !deploymentAvailable || !sourceAvailable)) {
      throw new Error(`Historical Git objects are unavailable: ${m.id}. Restore the audited archive to use --verify-git.`);
    }
    if (mappedAvailable && deploymentAvailable) {
      execFileSync("git", ["merge-base", "--is-ancestor", m.commit, deployment.sha], { cwd: root });
    }
    if ((mappedAvailable && patchId(m.commit) !== m.stablePatchId)
      || (sourceAvailable && patchId(source) !== m.sourceStablePatchId)) {
      throw new Error(`Historical patch does not match its recorded fingerprint: ${m.id}`);
    }
  }
  const features = mappings.map(m => {
    const original = legacy.find(e => e.id === m.id);
    if (!original) throw new Error(`Unknown historical feature: ${m.id}`);
    return { id: original.id, illustration: { kind: "code", name: illustration(original.id) },
      copy: Object.fromEntries(CHANGELOG_LOCALES.map(locale => {
        const { title, body } = original.copy[locale];
        // The overview is intentionally short; all historical detail stays behind the tile.
        const firstSentence = body.match(/^.*?[.!?](?=\s|$)/u)?.[0] ?? body;
        return [locale, { title, summary: firstSentence.length <= 160 ? firstSentence : `${firstSentence.slice(0, 157).replace(/\s+\S*$/u, "")}…`, details: [body] }];
      })),
    };
  });
  const copy = Object.fromEntries(CHANGELOG_LOCALES.map(locale => {
    const source = headlines[deployment.version]?.[locale]
      ?? (mappings.some(m => m.firstPublicationUncertain) ? archive[locale]
        : features.length ? [features[0].copy[locale].title, features[0].copy[locale].summary] : generic[locale]);
    return [locale, { title: source[0], summary: source[1] }];
  }));
  records.push(validateRelease({ version: deployment.version, layout: features.length >= 3 ? "bento" : "compact",
    publishedAt: deployment.publishedAt, sha: deployment.sha, deploymentId: deployment.id,
    copy, features, evidence: { commits: mappings.length ? mappings.map(m => m.commit) : [deployment.sha], issues: [] } }));
}
records.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
const ids = records.flatMap(r => r.features.map(f => f.id));
if (new Set(ids).size !== legacy.length || ids.length !== legacy.length) throw new Error("Backfill must cover each legacy entry exactly once");
const index = validateIndex(records.map(toIndexEntry));
const uncertainties = evidence.mappings.filter(m => m.firstPublicationUncertain).map(m => ({
  id: m.id, originalImplementationDate: legacy.find(e => e.id === m.id).implementationDate,
  firstConfirmedVersion: m.version,
  reason: "Earlier deployment SHAs are unavailable after history rewrites. This is a first-confirmed mapping, not a first-publication claim.",
}));
const outputs = new Map(records.map(r => [`releases/${r.version}.json`, r]));
outputs.set("index.json", index);
outputs.set("metadata.json", { lastPublishedDate: records[0].publishedAt.slice(0, 10) });
outputs.set("backfill-report.json", { legacyCount: legacy.length, migratedCount: ids.length,
  releaseCount: records.length, uncertainties, unresolvedDeploymentIds: evidence.unresolvedDeploymentIds });
let changed = 0;
for (const [file, value] of outputs) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const destination = path.join(folder, file);
  let current = "";
  try { current = await readFile(destination, "utf8"); } catch { /* First backfill. */ }
  if (current !== content) {
    changed += 1;
    if (!dryRun) { await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, content); }
  }
}
console.log(`${dryRun ? "Preview" : "Backfill"}: ${ids.length}/${legacy.length} features, ${records.length} confirmed versions, ${uncertainties.length} first-publication uncertainties, ${changed} changed files.`);
