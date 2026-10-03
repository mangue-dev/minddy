import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getChangelogFeature, getChangelogIndex, getChangelogPage, getChangelogRelease } from "./changelog";
import index from "@/content/changelog/index.json";
import legacy from "@/content/changelog/legacy.json";

beforeEach(() => { vi.stubEnv("MINDDY_CHANGELOG_URL", "https://catalog.example.test"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const unavailable = () => vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

describe("public changelog content", () => {
  it("uses verified history if the remote index is unavailable", async () => {
    unavailable();
    expect(await getChangelogIndex()).toEqual(index);
  });
  it("paginates one locale and omits feature details and private evidence", async () => {
    unavailable();
    const first = await getChangelogPage("fr");
    expect(first.releases).toHaveLength(4);
    expect(first.releases[0].title).toBe("Un espace plus privé et mieux connecté");
    expect(first.releases[0].features[0]).not.toHaveProperty("copy");
    expect(first.releases[0].features[0]).not.toHaveProperty("details");
    expect(first.releases[0].features[0]).not.toHaveProperty("summary");
    expect(first.releases[0]).not.toHaveProperty("evidence");
    expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(48 * 1024);
    const second = await getChangelogPage("fr", first.next!);
    expect(second.releases[0].version).not.toBe(first.releases[0].version);
    await expect(getChangelogPage("fr", "99.0.0")).rejects.toThrow("Unknown changelog cursor");
  });
  it("loads legacy feature anchors outside the first page and preserves localized details", async () => {
    unavailable();
    const feature = await getChangelogFeature("notebook-agent", "de");
    expect(feature?.details).toContain(legacy.find(f => f.id === "notebook-agent")!.copy.de.body);
    expect(feature).not.toHaveProperty("evidence");
  });
  it("never exposes a version outside the publication index", async () => {
    unavailable();
    expect(await getChangelogRelease("99.0.0")).toBeNull();
    expect(await getChangelogFeature("unpublished-feature", "en")).toBeNull();
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
