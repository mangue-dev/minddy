import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { metaExcerpt } from "./seo";
import enMessages from "../messages/en.json";
import frMessages from "../messages/fr.json";

const REPO_ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(REPO_ROOT, "app");

/**
 * The keys for `MetaPageKey` (lib/app-metadata.ts). Copied here rather
 * than imported: a type does not survive compilation, and it is precisely the
 * correspondence between the type and the catalog that we check.
 */
const META_PAGE_KEYS = [
  "home",
  "inbox",
  "all",
  "agents",
  "routines",
  "pullRequests",
  "statistics",
  "trash",
  "billing",
  "settings",
  "admin",
  "project",
  "triage",
  "pages",
  "objectives",
  "projectSettings",
  "feedback",
  "notFound",
  "oauthAuthorize",
  "oauthSuccess",
  "emailConfirmed",
  "confirmSignIn",
  "forgotPassword",
  "resetPassword",
] as const;

/** Paths of all directions rendered in HTML (`page.tsx`). */
function findPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    // `app/api` does not render any pages; `_`/`.` are private folders.
    if (entry === "api" || entry.startsWith("_") || entry.startsWith(".")) continue;
    if (statSync(full).isDirectory()) findPages(full, out);
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

/**
 * Files that can name a page: the page itself and each of its
 * ancestor layouts — EXCEPT the root layout, whose `default: "minddy"` would make
 * turn anything green.
 */
function titleSources(page: string): string[] {
  const files = [page];
  let dir = path.dirname(page);
  while (dir !== APP_DIR) {
    files.push(path.join(dir, "layout.tsx"));
    dir = path.dirname(dir);
  }
  return files;
}

/** Does the file declare titled metadata? */
function declaresTitle(file: string): boolean {
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  const hasExport =
    /export\s+(async\s+)?function\s+generateMetadata/.test(source) ||
    /export\s+const\s+metadata\b/.test(source);
  if (!hasExport) return false;
  // Either the title is placed on site, or it comes from one of the factories.
  // `publishedPageMetadata` (MIN-283) is one: the two routes of the page
  // published delegate their metadata to the rendering they share.
  return (
    /\btitle\b/.test(source) ||
    /\b(appPageMetadata|publicPageMetadata|publicTokenMetadata|publishedPageMetadata)\s*\(/.test(source)
  );
}

describe("page metadata (MIN-95)", () => {
  it("gives every page a title AND description key in both catalogs", () => {
    for (const key of META_PAGE_KEYS) {
      for (const [name, catalog] of [
        ["en.json", enMessages],
        ["fr.json", frMessages],
      ] as const) {
        const meta = (catalog as { Meta: Record<string, string> }).Meta;
        expect(meta[key], `${name} : Meta.${key}`).toBeTruthy();
        expect(meta[`${key}Description`], `${name} : Meta.${key}Description`).toBeTruthy();
      }
    }
  });

  it("leaves no orphaned `Meta` key behind", () => {
    // `description` (root layout fallback), `signIn` and `signUp` (including the
    // descriptions live in `Auth.loginSubtitle` / `Auth.signupSubtitle`,
    // with the rest of their screen) are the only keys outside the schema "a
    // page = two keys”.
    const expected = new Set<string>(["description", "signIn", "signUp"]);
    for (const key of META_PAGE_KEYS) {
      expected.add(key);
      expected.add(`${key}Description`);
    }
    const actual = Object.keys((enMessages as { Meta: Record<string, string> }).Meta);
    const extra = actual.filter((key) => !expected.has(key));
    expect(extra, `clés à retirer ou à typer dans MetaPageKey : ${extra.join(", ")}`).toEqual([]);
  });

  it("keeps both catalogs aligned key by key", () => {
    const flatten = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, child]) =>
            flatten(child, prefix ? `${prefix}.${key}` : key),
          )
        : [prefix];

    const en = new Set(flatten(enMessages));
    const fr = new Set(flatten(frMessages));
    expect([...en].filter((key) => !fr.has(key)), "absentes de fr.json").toEqual([]);
    expect([...fr].filter((key) => !en.has(key)), "absentes de en.json").toEqual([]);
  });

  it("leaves no page without its own title", () => {
    const pages = findPages(APP_DIR);
    // Net against a scan which would no longer find anything and would turn green.
    expect(pages.length).toBeGreaterThan(15);

    const untitled = pages
      .filter((page) => !titleSources(page).some(declaresTitle))
      .map((page) => path.relative(REPO_ROOT, page));

    expect(
      untitled,
      `pages qui retombent sur le titre par défaut : ${untitled.join(", ")}`,
    ).toEqual([]);
  });
});

describe("metaExcerpt", () => {
  it("laisse un texte court intact", () => {
    expect(metaExcerpt("Un besoin, une phrase.")).toBe("Un besoin, une phrase.");
  });

  it("collapses repeated whitespace and line breaks", () => {
    expect(metaExcerpt("deux\n\nlignes   collées")).toBe("deux lignes collées");
  });

  it("cuts at a word boundary, never in the middle", () => {
    const excerpt = metaExcerpt("ab cdefgh ijklmnop qrstuvwxyz", 20);
    expect(excerpt).toBe("ab cdefgh ijklmnop…");
    expect(excerpt.length).toBeLessThanOrEqual(20);
  });

  it("still cuts a single word longer than the limit", () => {
    expect(metaExcerpt("a".repeat(40), 10)).toBe(`${"a".repeat(9)}…`);
  });
});
