import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { metaExcerpt } from "./seo";
import enMessages from "../messages/en.json";
import frMessages from "../messages/fr.json";

const REPO_ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(REPO_ROOT, "app");

/**
 * Les clés de `MetaPageKey` (lib/app-metadata.ts). Recopiées ici plutôt
 * qu'importées : un type ne survit pas à la compilation, et c'est justement la
 * correspondance entre le type et le catalogue qu'on vérifie.
 */
const META_PAGE_KEYS = [
  "home",
  "inbox",
  "all",
  "agents",
  "pullRequests",
  "statistics",
  "billing",
  "settings",
  "admin",
  "project",
  "triage",
  "objectives",
  "projectSettings",
  "feedback",
  "notFound",
  "oauthAuthorize",
  "oauthSuccess",
  "emailConfirmed",
] as const;

/** Chemins de toutes les feuilles de route rendues en HTML (`page.tsx`). */
function findPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    // `app/api` ne rend aucune page ; `_`/`.` sont des dossiers privés.
    if (entry === "api" || entry.startsWith("_") || entry.startsWith(".")) continue;
    if (statSync(full).isDirectory()) findPages(full, out);
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

/**
 * Les fichiers qui peuvent nommer une page : la page elle-même et chacun de ses
 * layouts ancêtres — SAUF le root layout, dont le `default: "minddy"` ferait
 * passer n'importe quoi au vert.
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

/** Le fichier déclare-t-il des métadonnées porteuses d'un titre ? */
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
  // Soit le titre est posé sur place, soit il vient d'une des fabriques.
  return (
    /\btitle\b/.test(source) ||
    /\b(appPageMetadata|publicPageMetadata|publicTokenMetadata)\s*\(/.test(source)
  );
}

describe("métadonnées de page (MIN-95)", () => {
  it("donne à chaque page une clé de titre ET de description dans les deux catalogues", () => {
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

  it("ne laisse traîner aucune clé `Meta` orpheline", () => {
    // `description` (repli du root layout) et `signIn` (dont la description vit
    // dans `Auth.loginSubtitle`, avec le reste de la page de connexion) sont les
    // deux seules clés hors du schéma « une page = deux clés ».
    const expected = new Set<string>(["description", "signIn"]);
    for (const key of META_PAGE_KEYS) {
      expected.add(key);
      expected.add(`${key}Description`);
    }
    const actual = Object.keys((enMessages as { Meta: Record<string, string> }).Meta);
    const extra = actual.filter((key) => !expected.has(key));
    expect(extra, `clés à retirer ou à typer dans MetaPageKey : ${extra.join(", ")}`).toEqual([]);
  });

  it("garde les deux catalogues alignés, clé pour clé", () => {
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

  it("ne laisse aucune page sans titre à elle", () => {
    const pages = findPages(APP_DIR);
    // Filet contre un scan qui ne trouverait plus rien et passerait au vert.
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

  it("écrase les blancs multiples et les retours à la ligne", () => {
    expect(metaExcerpt("deux\n\nlignes   collées")).toBe("deux lignes collées");
  });

  it("coupe sur un mot, jamais au milieu", () => {
    const excerpt = metaExcerpt("ab cdefgh ijklmnop qrstuvwxyz", 20);
    expect(excerpt).toBe("ab cdefgh ijklmnop…");
    expect(excerpt.length).toBeLessThanOrEqual(20);
  });

  it("coupe quand même un mot unique plus long que la limite", () => {
    expect(metaExcerpt("a".repeat(40), 10)).toBe(`${"a".repeat(9)}…`);
  });
});
