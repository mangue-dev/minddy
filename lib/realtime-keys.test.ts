import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  keysForProjectEvent,
  projectScopeKeys,
  type BroadcastChange,
} from "./realtime-keys";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const PAGE = "44444444-4444-4444-8444-444444444444";

function change(
  table: string,
  overrides: Partial<BroadcastChange> = {}
): BroadcastChange {
  return {
    operation: "INSERT",
    table,
    schema: "public",
    record: null,
    old_record: null,
    ...overrides,
  };
}

/** La ligne `pages` telle que le trigger la diffuse (sans corps, cf. migration). */
function pageRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PAGE,
    project_id: PROJECT,
    parent_id: null,
    title: "Brief initial",
    icon: null,
    version: 1,
    position: "a0",
    favorite: false,
    deleted_at: null,
    deleted_root_id: null,
    ...overrides,
  };
}

const hasKey = (keys: { key: readonly unknown[] }[], expected: unknown[]) =>
  keys.some((k) => JSON.stringify(k.key) === JSON.stringify(expected));

/* ── Les PAGES (MIN-346) ───────────────────────────────────────────────────
   Le trou d'origine : la table diffusait (depuis cette même livraison) mais
   l'aiguilleur n'avait pas de branche pour elle — l'arbre restait celui du
   chargement, et une page créée sur la web app n'existait pas pour l'app de
   bureau. */

describe("keysForProjectEvent — pages", () => {
  it("rafraîchit l'arbre du projet quand une page est créée ailleurs", () => {
    const keys = keysForProjectEvent(
      change("pages", { operation: "INSERT", record: pageRow() }),
      PROJECT
    );
    expect(hasKey(keys, ["pages", PROJECT])).toBe(true);
    // Et il REPART au serveur : un arbre monté doit se repeindre, pas seulement
    // se marquer périmé.
    expect(keys.find((k) => k.key[0] === "pages")?.refetch).toBe("active");
  });

  it("rafraîchit l'arbre sur un renommage, un déplacement, un épinglage", () => {
    for (const patch of [
      { title: "Architecture" },
      { parent_id: PAGE, position: "a1" },
      { favorite: true },
    ]) {
      const keys = keysForProjectEvent(
        change("pages", {
          operation: "UPDATE",
          record: pageRow(patch),
          old_record: pageRow(),
        }),
        PROJECT
      );
      expect(hasKey(keys, ["pages", PROJECT])).toBe(true);
    }
  });

  it("bouge la corbeille et l'index de la palette, pas le board cross-projet", () => {
    const keys = keysForProjectEvent(
      change("pages", {
        operation: "UPDATE",
        record: pageRow({ deleted_at: "2026-08-14T09:00:00Z" }),
        old_record: pageRow(),
      }),
      PROJECT
    );
    expect(hasKey(keys, ["me", "trash"])).toBe(true);
    // L'index de la palette porte les titres de page, mais il est marqué périmé
    // sans requête : c'est un instantané qui se revalide à l'ouverture.
    expect(
      keys.find((k) => JSON.stringify(k.key) === '["me","search-index"]')?.refetch
    ).toBe("none");
    // Une page n'est pas un ticket : rien à redemander à `/api/me/board`.
    expect(hasKey(keys, ["me", "board"])).toBe(false);
  });

  it("rattrape l'arbre après une coupure", () => {
    // Le cache des pages est persisté sur le disque et son staleTime est de cinq
    // minutes : sans cette entrée, un onglet qui a dormi ne redemande rien.
    expect(
      projectScopeKeys(PROJECT).some(
        (key) => JSON.stringify(key) === JSON.stringify(["pages", PROJECT])
      )
    ).toBe(true);
  });
});

/* ── Le garde-fou : aucune table diffusée ne doit rester muette ─────────────
   C'est la faute que MIN-346 a corrigée, et elle ne lève RIEN — ni au
   type-check, ni à l'exécution. Le seul moyen de la revoir venir est de
   confronter l'aiguilleur à la liste réelle des triggers. */

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

/** Toutes les tables dont un trigger émet sur un topic `project:{id}`. */
function projectBroadcastTables(): string[] {
  const sql = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(MIGRATIONS, name), "utf8"))
    .join("\n");

  const projectFns = new Set<string>();
  const fnRe =
    /create or replace function public\.(\w+)\s*\(\s*\)\s*returns trigger([\s\S]*?)\$\$;/g;
  for (const m of sql.matchAll(fnRe)) {
    if (m[2].includes("'project:'")) projectFns.add(m[1]);
  }

  const tables = new Set<string>();
  const trigRe =
    /create trigger\s+\w+\s+after[\s\S]*?on public\.(\w+)[\s\S]*?execute function public\.(\w+)\s*\(\s*\)/gi;
  for (const m of sql.matchAll(trigRe)) {
    if (projectFns.has(m[2])) tables.add(m[1]);
  }
  return [...tables].sort();
}

describe("aucune table diffusée sur project:{id} n'est sans réponse", () => {
  const tables = projectBroadcastTables();

  it("la liste est bien lue depuis les migrations", () => {
    // Deux sondes : une historique, une neuve. Si l'extraction casse, elle
    // rendrait une liste vide et le test suivant passerait pour rien.
    expect(tables).toContain("issues");
    expect(tables).toContain("pages");
    expect(tables.length).toBeGreaterThan(10);
  });

  it.each(tables)("%s a une branche dans keysForProjectEvent", (table) => {
    // Les quatre parents possibles sont renseignés d'un coup : ce test ne juge
    // pas l'aiguillage fin (les tests par table s'en chargent), seulement qu'une
    // diffusion de cette table ne tombe pas dans le `default:`.
    const record = {
      id: "22222222-2222-4222-8222-222222222222",
      project_id: PROJECT,
      issue_id: "33333333-3333-4333-8333-333333333333",
      objective_id: "55555555-5555-4555-8555-555555555555",
      page_id: PAGE,
      feedback_post_id: "66666666-6666-4666-8666-666666666666",
    };
    expect(
      keysForProjectEvent(change(table, { record }), PROJECT).length
    ).toBeGreaterThan(0);
  });
});

/* ── La charge utile d'une page ne porte pas son corps ──────────────────────
   `content` va jusqu'à 1 Mo et l'enregistrement automatique écrit la page une
   fois par seconde de frappe. Une diffusion qui l'emporterait pousserait le
   document à tous les membres du projet, à chaque seconde. */

describe("le trigger des pages", () => {
  const sql = readFileSync(
    path.join(MIGRATIONS, "20261231090000_pages_realtime.sql"),
    "utf8"
  );

  it("retranche le corps et ses deux dérivées de la charge utile", () => {
    for (const column of ["content", "search_text", "search_tsv"]) {
      expect(sql).toContain(`- '${column}'`);
    }
  });

  it("ne déclenche pas sur une écriture du corps", () => {
    // Le `when (…)` de l'UPDATE ne nomme QUE des colonnes visibles : ni
    // `content`, ni `version`, ni les colonnes d'horodatage d'écriture.
    const when = /when \(([\s\S]*?)\)\s*execute function/.exec(sql)?.[1] ?? "";
    expect(when).not.toBe("");
    for (const column of ["content", "version", "updated_at", "updated_by"]) {
      expect(when).not.toContain(column);
    }
    for (const column of ["title", "icon", "parent_id", "position", "favorite", "deleted_at"]) {
      expect(when).toContain(column);
    }
  });
});
