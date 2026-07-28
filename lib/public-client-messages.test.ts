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
 * Racines du site public : le root layout (qui monte le bandeau cookies), la 404
 * — qui rend le chrome marketing directement sous lui — et les deux groupes de
 * routes publiques. Le reste de l'app monte son propre provider et garde tout le
 * catalogue, donc n'a rien à vérifier ici (voir `FULL_CATALOG_SEGMENTS`).
 */
const PUBLIC_ENTRIES = [
  "app/layout.tsx",
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

/** Résout un import RELATIF ou en `@/` vers un fichier du dépôt. Les paquets
    npm renvoient `null` : ils ne traduisent pas avec notre catalogue. */
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
  /** namespace → fichiers clients qui l'utilisent */
  namespaces: Map<string, Set<string>>;
  /** appels que l'analyse statique ne sait pas trancher */
  undecidable: string[];
  clientFiles: Set<string>;
}

/** Suit les imports depuis les racines et relève les namespaces traduits dans
    les fichiers marqués `"use client"`. */
function scanEntries(entries: readonly string[]): Scan {
  const seen = new Set<string>();
  const scan: Scan = { namespaces: new Map(), undecidable: [], clientFiles: new Set() };

  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const relative = path.relative(REPO_ROOT, file);

    // La directive doit être la première instruction du module : la chercher au
    // début seulement évite de prendre une mention en commentaire pour elle.
    if (/^\s*(["'])use client\1/m.test(source.slice(0, 400))) {
      scan.clientFiles.add(relative);
      for (const match of source.matchAll(/useTranslations\(\s*(["'`])([^"'`]+)\1/g)) {
        // `useTranslations("Keyboard.sections")` puise dans `Keyboard`.
        const namespace = match[2].split(".")[0];
        const users = scan.namespaces.get(namespace) ?? new Set<string>();
        users.add(relative);
        scan.namespaces.set(namespace, users);
      }
      // Sans littéral, on ne peut rien conclure — et le test doit le dire au
      // lieu de laisser passer un namespace manquant.
      if (/useTranslations\(\s*(\)|[^"'`)\s])/.test(source)) {
        scan.undecidable.push(`${relative} : useTranslations() sans namespace littéral`);
      }
      if (/\buseMessages\(/.test(source)) {
        scan.undecidable.push(`${relative} : useMessages() lit tout le catalogue`);
      }
    }

    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g)) {
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

  it("part bien de composants clients réels", () => {
    // Filet contre un scan qui ne résoudrait plus rien (renommage de dossier,
    // changement d'alias) et passerait alors au vert en ne trouvant personne.
    expect(scan.clientFiles.size).toBeGreaterThan(8);
    expect(scan.clientFiles).toContain("components/marketing/marketing-nav.tsx");
    expect(scan.clientFiles).toContain("components/cookie-banner.tsx");
  });

  it("couvre tous les namespaces traduits côté client", () => {
    const missing = [...scan.namespaces]
      .filter(([namespace]) => !PUBLIC_CLIENT_NAMESPACES.includes(namespace as never))
      .map(([namespace, users]) => `${namespace} (${[...users].join(", ")})`);

    // Le message d'échec dit quoi ajouter à PUBLIC_CLIENT_NAMESPACES, et qui
    // l'a demandé.
    expect(missing, `namespaces absents de PUBLIC_CLIENT_NAMESPACES : ${missing.join(" · ")}`)
      .toEqual([]);
  });

  it("n'en déclare aucun dont plus personne ne se sert", () => {
    const unused = PUBLIC_CLIENT_NAMESPACES.filter((ns) => !scan.namespaces.has(ns));
    expect(unused, `namespaces à retirer : ${unused.join(", ")}`).toEqual([]);
  });

  it("ne rencontre aucun appel indécidable", () => {
    expect(scan.undecidable).toEqual([]);
  });

  it("existent dans les deux catalogues", () => {
    for (const namespace of PUBLIC_CLIENT_NAMESPACES) {
      expect(enMessages, `en.json`).toHaveProperty(namespace);
      expect(frMessages, `fr.json`).toHaveProperty(namespace);
    }
  });

  it("réduit vraiment le catalogue", () => {
    const scoped = publicClientMessages(enMessages as Record<string, unknown>);
    expect(Object.keys(scoped).sort()).toEqual([...PUBLIC_CLIENT_NAMESPACES].sort());

    // Le gain est la raison d'être du fichier : s'il fond, c'est que le site
    // public s'est mis à demander la moitié du catalogue et qu'il faut
    // reprendre la question, pas relâcher le seuil.
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

/** Toutes les pages de `app/`, en chemin relatif au dépôt. */
function allPages(dir = path.join(REPO_ROOT, "app")): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...allPages(full));
    else if (entry.name === "page.tsx") found.push(path.relative(REPO_ROOT, full));
  }
  return found;
}

/** Chaîne des layouts au-dessus d'une page, du plus proche au root layout. */
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
 * Le root layout ne diffuse que `PUBLIC_CLIENT_NAMESPACES`, et il le fait sur
 * TOUTES les routes : ce qu'il envoie ne peut pas dépendre de la requête, un
 * layout partagé n'étant pas re-rendu lors d'une navigation cliente. Toute page
 * qui traduit ailleurs doit donc trouver `FullCatalogMessages` au-dessus d'elle.
 *
 * Sans ce test, la sanction d'un oubli est un `MISSING_MESSAGE` en production —
 * et seulement sur les visiteurs arrivés depuis le site public, ce qui le rend
 * invisible en développement, où l'on recharge la page.
 */
describe("chaque page reçoit les messages qu'elle traduit", () => {
  const pages = allPages();

  it("trouve bien toutes les pages", () => {
    expect(pages.length).toBeGreaterThan(20);
    expect(pages).toContain("app/(auth)/login/page.tsx");
  });

  it.each(pages)("%s", (page) => {
    const chain = layoutChain(page);
    // L'IMPORT, pas le nom : le root layout cite `FullCatalogMessages` dans le
    // commentaire qui explique pourquoi il ne le monte pas, et une simple
    // recherche de chaîne déclarait alors toutes les pages servies.
    const servesFullCatalog = chain.some((layout) =>
      /from\s*["']@\/components\/full-catalog-messages["']/.test(
        readFileSync(path.join(REPO_ROOT, layout), "utf8"),
      ),
    );
    if (servesFullCatalog) return;

    // Pas de provider au-dessus : la page ne dispose que du jeu public.
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
