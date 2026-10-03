import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import type { Locale } from "@/i18n/config";
import type { ChangelogFeatureDetail, ChangelogIndexEntry, ChangelogPageContent, ChangelogRelease, ChangelogReleaseSummary } from "@/lib/changelog-types";
import { validateIndex, validateRelease, toIndexEntry, MAX_RELEASE_BYTES, MAX_PAGE_BYTES } from "@/scripts/changelog-lib.mjs";
import historicalIndex from "@/content/changelog/index.json";

export const CHANGELOG_PAGE_SIZE = 4;
const HISTORY_ROOT = path.join(process.cwd(), "content/changelog/releases");
const PUBLIC_CACHE = { next: { revalidate: 60 } };

function catalogBase(): string | null {
  const custom = process.env.MINDDY_CHANGELOG_URL;
  const supabase = process.env.MINDDY_PUBLIC_SUPABASE_URL;
  return custom?.replace(/\/$/, "") ?? (supabase ? `${supabase.replace(/\/$/, "")}/storage/v1/object/public/changelog` : null);
}

async function remoteJson(file: string, budget: number): Promise<unknown | null> {
  const base = catalogBase();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/${file}`, { ...PUBLIC_CACHE, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    // Bound streamed responses too: Content-Length is not required by HTTP.
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > budget) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return null; }
}

/** Only the publication index can make a release visible; draft files are never read. */
export const getChangelogIndex = cache(async (): Promise<ChangelogIndexEntry[]> => {
  const remote = await remoteJson("index.json", 1024 * 1024);
  if (remote) {
    try {
      const index = validateIndex(remote);
      if (index.length) return index;
    } catch { /* Keep verified history during a catalog outage. */ }
  }
  return validateIndex(historicalIndex);
});

export const getChangelogRelease = cache(async (version: string): Promise<ChangelogRelease | null> => {
  const entry = (await getChangelogIndex()).find(r => r.version === version);
  if (!entry) return null;
  const remote = await remoteJson(`releases/${version}.json`, MAX_RELEASE_BYTES);
  const candidates: unknown[] = remote ? [remote] : [];
  if (historicalIndex.some(r => r.version === version)) {
    try { candidates.push(JSON.parse(await readFile(path.join(HISTORY_ROOT, `${version}.json`), "utf8"))); } catch { /* The live store can still serve this version. */ }
  }
  for (const value of candidates) {
    try {
      const release = validateRelease(value);
      if (JSON.stringify(toIndexEntry(release)) === JSON.stringify(entry)) return release;
    } catch { /* Never expose content that disagrees with its publication record. */ }
  }
  return null;
});

export function summarizeRelease(release: ChangelogRelease, locale: Locale): ChangelogReleaseSummary {
  return {
    version: release.version, publishedAt: release.publishedAt, layout: release.layout,
    ...release.copy[locale],
    features: release.features.map(f => ({ id: f.id, illustration: f.illustration,
      title: f.copy[locale].title })),
  };
}

export async function getChangelogPage(locale: Locale, after?: string): Promise<ChangelogPageContent> {
  const index = await getChangelogIndex();
  const cursor = after ? index.findIndex(r => r.version === after) : -1;
  if (after && cursor === -1) throw new Error("Unknown changelog cursor");
  const entries = index.slice(cursor + 1, cursor + 1 + CHANGELOG_PAGE_SIZE);
  const content = await Promise.all(entries.map(r => getChangelogRelease(r.version)));
  // Do not silently skip a published release if its content is temporarily unavailable.
  if (content.some(r => !r)) throw new Error("Changelog content is temporarily unavailable");
  const page = {
    releases: content.map(r => summarizeRelease(r!, locale)),
    next: cursor + 1 + entries.length < index.length ? entries.at(-1)!.version : null,
  };
  if (Buffer.byteLength(JSON.stringify(page)) > MAX_PAGE_BYTES) throw new Error("Changelog page exceeds its content budget");
  return page;
}

export async function getChangelogFeature(id: string, locale: Locale): Promise<ChangelogFeatureDetail | null> {
  const entry = (await getChangelogIndex()).find(r => r.featureIds.includes(id));
  if (!entry) return null;
  const release = await getChangelogRelease(entry.version);
  const feature = release?.features.find(f => f.id === id);
  return feature ? { id, version: entry.version, illustration: feature.illustration,
    title: feature.copy[locale].title, details: feature.copy[locale].details } : null;
}
