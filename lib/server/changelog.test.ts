import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getChangelogFeature, getChangelogIndex, getChangelogPage, getChangelogRelease } from "./changelog";
import index from "@/content/changelog/index.json";
import legacy from "@/content/changelog/legacy.json";
const release = JSON.parse(readFileSync("content/changelog/releases/0.11.0.json", "utf8"));

beforeEach(() => { vi.stubEnv("MINDDY_CHANGELOG_URL", "https://catalog.example.test"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const unavailable = () => vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

describe("public changelog content", () => {
  it("uses verified history if the remote index is unavailable", async () => {
    unavailable();
    expect(await getChangelogIndex()).toEqual(index);
  });
  it("includes ready-to-open details in one locale and omits private evidence", async () => {
    unavailable();
    const first = await getChangelogPage("fr");
    expect(first.releases).toHaveLength(1);
    expect(first.releases[0].version).toBe("0.11.0");
    expect(first.next).toBeNull();
    expect(first.releases[0].title).toBe("Un espace plus privé et mieux connecté");
    expect(first.releases[0].features[0]).not.toHaveProperty("copy");
    expect(first.releases[0].features[0].details).toEqual(release.features[0].copy.fr.details);
    expect(first.releases[0].features[0]).not.toHaveProperty("summary");
    expect(first.releases[0]).not.toHaveProperty("evidence");
    expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(48 * 1024);
    await expect(getChangelogPage("fr", "99.0.0")).rejects.toThrow("Unknown changelog cursor");
  });
  it("preserves retained feature anchors and rejects retired features and releases", async () => {
    unavailable();
    const feature = await getChangelogFeature("encrypted-workspace-content", "de");
    expect(feature?.details).toContain(legacy.find(f => f.id === "encrypted-workspace-content")!.copy.de.body);
    expect(feature).not.toHaveProperty("evidence");
    expect(await getChangelogFeature("notebook-agent", "de")).toBeNull();
    expect(await getChangelogRelease("0.10.25")).toBeNull();
  });
  it("filters obsolete remote versions while retaining later releases and localized pagination", async () => {
    const old = { ...structuredClone(release), version: "0.10.100", publishedAt: "2026-09-01T12:00:00Z", layout: "compact", features: [] };
    const future = Array.from({ length: 4 }, (_, i) => {
      const value = structuredClone(release);
      value.version = `0.11.${4 - i}`;
      value.publishedAt = `2026-10-0${4 - i}T12:00:00Z`;
      value.features = [value.features[0]];
      value.layout = "compact";
      value.features[0].id = `new-${i}`;
      return value;
    });
    const { toIndexEntry } = await import("@/scripts/changelog-lib.mjs");
    const catalog = [...future, release, old];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("index.json")
      ? catalog.map(toIndexEntry) : catalog.find(r => url.endsWith(`/releases/${r.version}.json`)))));
    expect((await getChangelogIndex()).map(r => r.version)).toEqual(["0.11.4", "0.11.3", "0.11.2", "0.11.1", "0.11.0"]);
    const first = await getChangelogPage("de");
    expect(first.releases).toHaveLength(4);
    expect(first.releases[0].features[0].details).toEqual(release.features[0].copy.de.details);
    const second = await getChangelogPage("de", first.next!);
    expect(second.releases.map(r => r.version)).toEqual(["0.11.0"]);
    expect(second.next).toBeNull();
    expect(await getChangelogRelease(old.version)).toBeNull();
    await expect(getChangelogPage("de", old.version)).rejects.toThrow("Unknown changelog cursor");
  });
  it("never exposes a version outside the publication index", async () => {
    unavailable();
    expect(await getChangelogRelease("99.0.0")).toBeNull();
    expect(await getChangelogFeature("unpublished-feature", "en")).toBeNull();
  });
  it("uses shorter pages when ready-to-open details would exceed the payload budget", async () => {
    const future = [2, 1].map(n => {
      const value = structuredClone(release);
      value.version = `0.11.${n}`;
      value.publishedAt = `2026-10-0${n}T12:00:00Z`;
      value.features = value.features.slice(0, 4);
      value.features.forEach((f: typeof release.features[number], i: number) => {
        f.id = `large-${n}-${i}`;
        for (const copy of Object.values(f.copy) as { details: string[] }[]) copy.details = Array(6).fill("x".repeat(1000));
      });
      return value;
    });
    const { toIndexEntry } = await import("@/scripts/changelog-lib.mjs");
    const catalog = [...future, release];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("index.json")
      ? catalog.map(toIndexEntry) : catalog.find(r => url.endsWith(`/releases/${r.version}.json`)))));
    const first = await getChangelogPage("en");
    expect(first.releases.map(r => r.version)).toEqual(["0.11.2"]);
    expect(first.next).toBe("0.11.2");
    const second = await getChangelogPage("en", first.next!);
    expect(second.releases.map(r => r.version)).toEqual(["0.11.1", "0.11.0"]);
    expect(second.next).toBeNull();
    for (const page of [first, second]) expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(48 * 1024);
  });
  it("ignores remote content whose publication metadata disagrees with its index", async () => {
    const historical = JSON.parse(readFileSync("content/changelog/releases/0.11.0.json", "utf8"));
    const mismatch = { ...historical, sha: "f".repeat(40), copy: { ...historical.copy, en: { title: "Wrong release", summary: "Wrong" } } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("index.json") ? index : mismatch)));
    expect((await getChangelogRelease("0.11.0"))!.copy.en.title).toBe(historical.copy.en.title);
  });
  it("rejects remote duplicate versions without losing verified history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([index[0], index[0]])));
    expect(await getChangelogIndex()).toEqual(index);
  });
  it("keeps every historical page under the bounded payload budget", async () => {
    unavailable();
    for (const locale of ["en", "fr", "de", "pt-BR", "it", "es"] as const) {
      let after: string | undefined;
      do {
        const page = await getChangelogPage(locale, after);
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(48 * 1024);
        after = page.next ?? undefined;
      } while (after);
    }
  });
});
