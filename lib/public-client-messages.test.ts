import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_CLIENT_NAMESPACES,
  publicClientMessages,
} from "./public-client-messages";
import enMessages from "../messages/en.json";
import frMessages from "../messages/fr.json";

const REPO_ROOT = path.resolve(__dirname, "..");

/**
 * Roots of the public site: the root layout (which mounts the cookies banner), the 404
 * — which renders the marketing chrome directly under it — and the two groups of
 * public routes. The rest of the app sets up its own provider and keeps the entire
 * catalog, so has nothing to check here (see `FULL_CATALOG_SEGMENTS`).
 */
const PUBLIC_ENTRIES = [
  "app/layout.tsx",
  "app/error.tsx",
  "app/not-found.tsx",
  "app/(marketing)/layout.tsx",
  "app/(marketing)/page.tsx",
  "app/(marketing)/pricing/page.tsx",
  "app/(legal)/layout.tsx",
  "app/(legal)/legal/page.tsx",
  "app/(legal)/terms/page.tsx",
  "app/(legal)/privacy/page.tsx",
  "app/(legal)/cookies/page.tsx",
];

const CANDIDATE_SUFFIXES = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];

/** Resolves a RELATIVE or `@/` import to a repository file.
 npm packages return `null`: they do not translate with our catalog. */
function resolveImport(specifier: string, from: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(REPO_ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null;

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

interface Scan {
  /** namespace → client files that use it */
  namespaces: Map<string, Set<string>>;
  /** calls that static analysis cannot resolve */
  undecidable: string[];
  clientFiles: Set<string>;
}

/** Tracks imports from the roots and notes translated namespaces in
 files marked `"use client"`. */
function scanEntries(entries: readonly string[]): Scan {
  const seen = new Set<string>();
  const scan: Scan = { namespaces: new Map(), undecidable: [], clientFiles: new Set() };

  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const relative = path.relative(REPO_ROOT, file);

    // The directive must be the first instruction of the module: look for it at
    // start only avoids taking a comment for it.
    if (/^\s*(["'])use client\1/m.test(source.slice(0, 400))) {
      scan.clientFiles.add(relative);
      for (const match of source.matchAll(/useTranslations\(\s*(["'`])([^"'`]+)\1/g)) {
        // `useTranslations("Keyboard.sections")` reads from `Keyboard`.
        const namespace = match[2].split(".")[0];
        const users = scan.namespaces.get(namespace) ?? new Set<string>();
        users.add(relative);
        scan.namespaces.set(namespace, users);
      }
      // Without a literal, we cannot conclude anything — and the test must say so
      // instead of allowing a missing namespace through.
      if (/useTranslations\(\s*(\)|[^"'`)\s])/.test(source)) {
        scan.undecidable.push(`${relative} : useTranslations() sans namespace littéral`);
      }
      if (/\buseMessages\(/.test(source)) {
        scan.undecidable.push(`${relative} : useMessages() lit tout le catalogue`);
      }
    }

    // TYPES imports are removed before following the graph: `import
    // type … from "x"` is erased at compilation, so `x` is never
    // loaded at runtime and brings no `useTranslations` to the page. THE
    // follow still brings up namespaces that no bytes sent
    // to the browser contain — a false positive we could only correct
    // than by declaring public a namespace which is not.
    const runtime = source.replace(
      /^[ \t]*(?:import|export)[ \t]+type[ \t][^;\n]*(?:\n[^;]*)*?;/gm,
      ""
    );
    for (const match of runtime.matchAll(/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g)) {
      const next = resolveImport(match[1], file);
      if (next) walk(next);
    }
  };

  for (const entry of entries) {
    const file = path.join(REPO_ROOT, entry);
    if (!existsSync(file)) throw new Error(`racine introuvable : ${entry}`);
    walk(file);
  }
  return scan;
}

describe("messages du site public", () => {
  const scan = scanEntries(PUBLIC_ENTRIES);

  it("starts from real client components", () => {
    // Net against a scan which would no longer resolve anything (folder renaming,
    // alias change) and would then turn green when finding no one.
    expect(scan.clientFiles.size).toBeGreaterThan(8);
    expect(scan.clientFiles).toContain("components/marketing/marketing-nav.tsx");
    expect(scan.clientFiles).toContain("components/cookie-banner.tsx");
  });

  it("covers all namespaces translated on the client", () => {
    const missing = [...scan.namespaces]
      .filter(([namespace]) => !PUBLIC_CLIENT_NAMESPACES.includes(namespace as never))
      .map(([namespace, users]) => `${namespace} (${[...users].join(", ")})`);

    // The failure message says what to add to PUBLIC_CLIENT_NAMESPACES, and which
    // asked for it.
    expect(missing, `namespaces absents de PUBLIC_CLIENT_NAMESPACES : ${missing.join(" · ")}`)
      .toEqual([]);
  });

  it("n'en déclare aucun dont plus personne ne se sert", () => {
    const unused = PUBLIC_CLIENT_NAMESPACES.filter((ns) => !scan.namespaces.has(ns));
    expect(unused, `namespaces à retirer : ${unused.join(", ")}`).toEqual([]);
  });

  it("finds no undecidable call", () => {
    expect(scan.undecidable).toEqual([]);
  });

  it("exist in both catalogs", () => {
    for (const namespace of PUBLIC_CLIENT_NAMESPACES) {
      expect(enMessages, `en.json`).toHaveProperty(namespace);
      expect(frMessages, `fr.json`).toHaveProperty(namespace);
    }
  });

  it("actually reduces the catalog", () => {
    const scoped = publicClientMessages(enMessages as Record<string, unknown>);
    expect(Object.keys(scoped).sort()).toEqual([...PUBLIC_CLIENT_NAMESPACES].sort());

    // The gain is the reason for the file's existence: if it melts, it's because the site
    // public has started to ask for half of the catalog and that it is necessary
    // resume the question, not release the threshold.
    const full = JSON.stringify(enMessages).length;
    const trimmed = JSON.stringify(scoped).length;
    expect(trimmed / full).toBeLessThan(0.2);
  });

  it("ignore un namespace absent du catalogue au lieu de poser undefined", () => {
    const scoped = publicClientMessages({ Landing: { a: "1" } });
    expect(scoped).toEqual({ Landing: { a: "1" } });
    expect("Billing" in scoped).toBe(false);
  });
});

/** All pages of `app/`, in path relative to the repository. */
function allPages(dir = path.join(REPO_ROOT, "app")): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...allPages(full));
    else if (entry.name === "page.tsx") found.push(path.relative(REPO_ROOT, full));
  }
  return found;
}

/** Chain of layouts above a page, from closest to root layout. */
function layoutChain(page: string): string[] {
  const chain: string[] = [];
  let dir = path.dirname(path.join(REPO_ROOT, page));
  const appDir = path.join(REPO_ROOT, "app");
  for (;;) {
    const layout = path.join(dir, "layout.tsx");
    if (existsSync(layout)) chain.push(path.relative(REPO_ROOT, layout));
    if (dir === appDir) break;
    dir = path.dirname(dir);
  }
  return chain;
}

/**
 * The root layout only broadcasts `PUBLIC_CLIENT_NAMESPACES`, and it does so on
 * ALL routes: what it sends cannot depend on the request, a shared
 * layout is not re-rendered during a client navigation. Any page
 * which translates elsewhere must therefore find `FullCatalogMessages` above it.
 *
 * Without this test, the sanction for an oversight is a `MISSING_MESSAGE` in production —
 * and only on visitors arriving from the public site, which makes
 * invisible in development, where we reload the page.
 */
describe("each page receives the messages it translates", () => {
  const pages = allPages();

  it("finds all pages", () => {
    expect(pages.length).toBeGreaterThan(20);
    expect(pages).toContain("app/(auth)/login/page.tsx");
  });

  it.each(pages)("%s", (page) => {
    const chain = layoutChain(page);
    // IMPORT, not the name: the root layout cites `FullCatalogMessages` in the
    // comment that explains why he doesn't mount it, and a simple
    // string search then declared all pages served.
    const servesFullCatalog = chain.some((layout) =>
      /from\s*["']@\/components\/full-catalog-messages["']/.test(
        readFileSync(path.join(REPO_ROOT, layout), "utf8"),
      ),
    );
    if (servesFullCatalog) return;

    // No provider above: the page only has the public set.
    const scan = scanEntries([page, ...chain]);
    const missing = [...scan.namespaces]
      .filter(([namespace]) => !PUBLIC_CLIENT_NAMESPACES.includes(namespace as never))
      .map(([namespace, users]) => `${namespace} (${[...users].join(", ")})`);

    expect(
      missing,
      `${page} traduit hors du jeu public sans <FullCatalogMessages> au-dessus : ${missing.join(" · ")}`,
    ).toEqual([]);
    expect(scan.undecidable, `${page} : ${scan.undecidable.join(" | ")}`).toEqual([]);
  });
});
