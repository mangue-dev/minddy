#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { documentationBlocks, documentationLocales, parseDocumentation, isPublishedDocumentation, resolveDocumentationPath } from "../lib/documentation-core.mjs";

const rootIndex = process.argv.indexOf("--root");
if (rootIndex >= 0 && !process.argv[rootIndex + 1]) throw new Error("--root requires a repository path.");
const root = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = process.argv.includes("--release");
const corpusRoot = path.join(root, "content/documentation");
const coverage = JSON.parse(fs.readFileSync(path.join(corpusRoot, "coverage.json"), "utf8"));
const articles = [];
const errors = [];
const fail = message => errors.push(message);
const required = ["id", "locale", "title", "summary", "topic", "type", "audiences", "workflows", "visibility", "status", "revision", "sourceRevision", "owner", "updatedAt", "compatibility", "review", "related", "aliases", "tags", "figures", "requiredFigures"];
const text = value => typeof value === "string" && value.trim().length > 0;
const date = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const strings = value => Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
const markdown = new MarkdownIt({ html: false });
const publicPaths = new Set(["/self-hosting", "/self-hosting/install", "/pricing", "/mcp", "/feedback", "/login", "/signup"]);
function markdownTargets(content) {
  const targets = [];
  const visit = tokens => tokens.forEach(token => {
    if (token.type === "link_open" || token.type === "image") targets.push({ image: token.type === "image", href: token.attrGet(token.type === "image" ? "src" : "href") });
    if (token.children) visit(token.children);
  });
  visit(markdown.parse(content, {}));
  return targets;
}
const knownWorkflows = new Set(coverage.map(row => row.workflow));
const matrix = fs.readFileSync(path.join(root, "docs/plans/min-664-coverage.md"), "utf8");
const matrixRows = [...matrix.matchAll(/^\| ([A-Z]\d{2}) `([^`]+)` \|/gm)].map(match => `${match[1]}:${match[2]}`);
if (JSON.stringify(matrixRows.sort()) !== JSON.stringify(coverage.map(row => `${row.workflow}:${row.article}`).sort())) fail("Coverage ledger differs from the approved matrix.");

for (const locale of documentationLocales) {
  const directory = path.join(corpusRoot, locale);
  if (!fs.existsSync(directory)) continue;
  for (const filename of fs.readdirSync(directory).filter(file => file.endsWith(".md"))) {
    const context = `${locale}/${filename}`;
    try {
      const article = parseDocumentation(fs.readFileSync(path.join(directory, filename), "utf8"));
      articles.push(article);
      for (const key of required) if (!(key in article)) fail(`${context}: missing ${key}`);
      for (const key of ["id", "locale", "title", "summary", "topic", "owner", "content"]) if (!text(article[key])) fail(`${context}: empty ${key}`);
      if (article.id !== filename.slice(0, -3) || article.locale !== locale || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.id)) fail(`${context}: invalid identity`);
      if (!["public", "internal"].includes(article.visibility) || !["draft", "published"].includes(article.status)) fail(`${context}: invalid publication state`);
      if (!["tutorial", "guide", "explanation", "reference", "troubleshooting"].includes(article.type)) fail(`${context}: invalid article type`);
      for (const key of ["audiences", "workflows", "related", "aliases", "tags", "figures", "requiredFigures"]) if (!Array.isArray(article[key])) fail(`${context}: ${key} must be an array`);
      for (const key of ["audiences", "workflows", "related", "aliases", "tags", "requiredFigures"]) if (!strings(article[key])) fail(`${context}: ${key} must contain unique nonempty strings`);
      if (!article.audiences?.length || article.audiences.some(item => !["member", "owner", "visitor", "operator", "integrator"].includes(item))) fail(`${context}: invalid audiences`);
      if (!Number.isInteger(article.revision) || article.revision < 1 || !Number.isInteger(article.sourceRevision) || article.sourceRevision < 1) fail(`${context}: invalid revision`);
      if (!date(article.updatedAt) || !article.owner?.trim()) fail(`${context}: missing owner or update date`);
      if (!article.compatibility?.version || !article.compatibility.editions?.length || !article.compatibility.profiles?.length || !article.compatibility.evidence?.length) fail(`${context}: incomplete compatibility evidence`);
      for (const key of ["editions", "profiles", "evidence"]) if (!strings(article.compatibility?.[key])) fail(`${context}: invalid compatibility ${key}`);
      for (const evidence of article.compatibility?.evidence ?? []) if (typeof evidence !== "string" || evidence.includes("..") || path.isAbsolute(evidence) || !fs.existsSync(path.join(root, evidence))) fail(`${context}: missing source evidence ${evidence}`);
      if (!article.sections.length || new Set(article.sections.map(section => section.id)).size !== article.sections.length) fail(`${context}: missing or repeated section IDs`);
      if (documentationBlocks(article.content).some(block => block.id && !block.content)) fail(`${context}: empty section`);
      if (article.workflows.some(id => !knownWorkflows.has(id))) fail(`${context}: unknown workflow`);
      for (const figure of article.figures) {
        if (!Number.isInteger(figure.revision) || figure.revision < 1 || typeof figure.reviewed !== "boolean" || (figure.kind && !["diagram", "screenshot"].includes(figure.kind))) fail(`${context}: invalid figure state`);
        if (!figure.id || !figure.alt || !figure.caption || !date(figure.capturedAt) || !["light", "dark", "neutral"].includes(figure.theme) || figure.viewport?.length !== 2) fail(`${context}: incomplete figure metadata`);
        if (!figure.src?.startsWith(`/documentation/${locale}/`) || figure.src.includes("..") || !fs.existsSync(path.join(root, "public", figure.src))) fail(`${context}: missing or unsafe locale figure ${figure.src}`);
        if (!article.content.includes(figure.src)) fail(`${context}: unused figure ${figure.id}`);
        if (!figure.viewport?.every(value => Number.isInteger(value) && value > 0)) fail(`${context}: invalid figure viewport`);
      }
      if (new Set(article.figures.map(figure => figure.id)).size !== article.figures.length) fail(`${context}: repeated figure IDs`);
      const prose = article.content.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
      if (prose.includes("—")) fail(`${context}: sentence em dash needs editorial correction`);
      if (article.status === "published" && article.visibility === "public" && (!date(article.review?.date) || article.review?.revision !== article.revision || !article.review.fact || !article.review.language)) fail(`${context}: missing current factual/language review`);
    } catch (error) { fail(`${context}: ${error.message}`); }
  }
}
const byKey = new Map(articles.map(article => [`${article.locale}:${article.id}`, article]));
if (byKey.size !== articles.length) fail("Duplicate article identities.");
for (const locale of documentationLocales) {
  const aliases = new Map();
  for (const article of articles.filter(item => item.locale === locale)) for (const alias of article.aliases) {
    if (aliases.has(alias) && aliases.get(alias) !== article.id) fail(`${locale}: competing alias ${alias}`);
    if (alias !== article.id && byKey.has(`${locale}:${alias}`)) fail(`${locale}: alias shadows article ${alias}`);
    aliases.set(alias, article.id);
  }
}
for (const article of articles) {
  const context = `${article.locale}/${article.id}`;
  const source = byKey.get(`en:${article.id}`);
  if (!source) fail(`${context}: missing English source`);
  else {
    if (article.sourceRevision !== source.revision) fail(`${context}: stale translation revision`);
    if (JSON.stringify(article.sections.map(section => section.id)) !== JSON.stringify(source.sections.map(section => section.id))) fail(`${context}: section parity differs`);
    for (const key of ["workflows", "related", "requiredFigures"]) if (JSON.stringify(article[key]) !== JSON.stringify(source[key])) fail(`${context}: ${key} parity differs`);
  }
  for (const id of article.related) {
    const related = byKey.get(`${article.locale}:${id}`);
    if (!related) fail(`${context}: missing related article ${id}`);
    else if (article.status === "published" && !isPublishedDocumentation(related, articles)) fail(`${context}: related article is unavailable publicly: ${id}`);
  }
  for (const { href: target, image } of markdownTargets(article.content)) {
    if (!target) { fail(`${context}: empty link`); continue; }
    if (/^(https?:|mailto:)/.test(target) && !image) continue;
    if (image) {
      if (!article.figures.some(figure => figure.src === target)) fail(`${context}: unregistered image ${target}`);
      continue;
    }
    const [location, anchor] = target.split("#");
    const pathname = location.split("?")[0];
    const route = resolveDocumentationPath(pathname);
    if ((route && !route.id && !anchor) || publicPaths.has(pathname)) continue;
    const destination = pathname ? route && byKey.get(`${article.locale}:${route.id}`) : article;
    if (!destination) { fail(`${context}: unresolved local link ${target}`); continue; }
    if (anchor && !destination.sections.some(section => section.id === anchor)) fail(`${context}: missing anchor ${target}`);
    if (article.status === "published" && !isPublishedDocumentation(destination, articles)) fail(`${context}: published link targets unavailable public content ${target}`);
  }
  if (article.status === "published" && article.visibility === "public" && !isPublishedDocumentation(article, articles)) fail(`${context}: incomplete public release set`);
}
let published = 0;
const missing = [];
for (const row of coverage) {
  const complete = documentationLocales.every(locale => {
    const article = byKey.get(`${locale}:${row.article}`);
    return article?.workflows.includes(row.workflow) && article.sections.some(section => section.id === row.section)
      && (!row.requiresFigures || article.requiredFigures.length > 0) && isPublishedDocumentation(article, articles);
  });
  if (complete) published++;
  else missing.push(row.workflow);
}
if (release && missing.length) fail(`Release coverage incomplete: ${missing.join(", ")}`);
console.log(`Documentation: ${articles.length} locale articles; ${published}/${coverage.length} workflows published in all six languages.`);
if (missing.length && !release) console.log(`Release acceptance remains pending for ${missing.length} workflows. Run check:documentation:release before closing MIN-664.`);
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
