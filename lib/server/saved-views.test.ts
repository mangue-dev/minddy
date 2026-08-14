import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSavedView, updateSavedView } from "./saved-views";

/**
 * Les écritures des VUES ENREGISTRÉES (« Enregistrer la vue actuelle », ⌘K).
 *
 * Deux choses seulement s'y jouent, et aucune ne se voit à l'écran :
 *
 * 1. **Ce qu'on accepte d'écrire.** Une vue enregistrée est une adresse qu'on
 *    rouvrira d'un clic, plus tard, sans la relire. Une adresse qui SORT du
 *    site (`//ailleurs.example`, lue par un navigateur comme un autre hôte)
 *    deviendrait un lien de redirection ouverte planqué dans la palette de son
 *    propre compte. Le refus doit se produire AVANT la base — la contrainte
 *    `check` de la migration est le dernier rempart, pas le premier.
 * 2. **Réenregistrer sous un nom connu DÉPLACE la vue.** Sans ça, la palette
 *    empilerait deux lignes du même nom, qu'on ne pourrait plus distinguer.
 *
 * Le double PostgREST applique vraiment l'unicité `(user_id, name)` : sinon le
 * test ne dirait rien de l'`onConflict` qu'on écrit.
 */

interface Row extends Record<string, unknown> {
  id: string;
  user_id: string;
  name: string;
  href: string;
}

let rows: Row[] = [];
let nextId = 0;

/** Double de chaîne PostgREST réduit à ce que `saved-views` touche. */
function table() {
  const filters: ((row: Row) => boolean)[] = [];
  let upserted: { payload: Record<string, unknown>; onConflict: string } | null = null;
  let updated: Record<string, unknown> | null = null;
  const query: Record<string, unknown> = {};

  query.select = () => query;
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return query;
  };
  query.upsert = (
    payload: Record<string, unknown>,
    options: { onConflict: string }
  ) => {
    upserted = { payload, onConflict: options.onConflict };
    return query;
  };
  query.update = (payload: Record<string, unknown>) => {
    updated = payload;
    return query;
  };

  const resolve = () => {
    if (upserted) {
      const { payload, onConflict } = upserted;
      // L'unicité est celle de l'index : deux colonnes, pas d'expression.
      const keys = onConflict.split(",").map((k) => k.trim());
      const existing = rows.find((row) => keys.every((k) => row[k] === payload[k]));
      if (existing) {
        Object.assign(existing, payload);
        return { data: existing, error: null };
      }
      const written = { id: `sv-${++nextId}`, ...payload } as Row;
      rows.push(written);
      return { data: written, error: null };
    }
    const matching = rows.filter((row) => filters.every((f) => f(row)));
    if (updated) {
      // RLS : une ligne d'un autre compte est invisible, donc pas mise à jour.
      if (matching.length === 0) return { data: null, error: null };
      const target = matching[0];
      // L'index unique vaut aussi pour un UPDATE — c'est ce que Postgres
      // renverrait, code compris.
      if (
        typeof updated.name === "string" &&
        rows.some(
          (row) =>
            row !== target &&
            row.user_id === target.user_id &&
            row.name === updated!.name
        )
      ) {
        return {
          data: null,
          error: { code: "23505", message: "duplicate key value" },
        };
      }
      Object.assign(target, updated);
      return { data: target, error: null };
    }
    return { data: matching[0] ?? null, error: null };
  };

  query.single = () => Promise.resolve(resolve());
  query.maybeSingle = () => Promise.resolve(resolve());
  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return query;
}

const supabase = { from: () => table() } as unknown as SupabaseClient;

beforeEach(() => {
  rows = [];
  nextId = 0;
});

describe("createSavedView", () => {
  it("enregistre l'écran sous son nom, rogné", async () => {
    const result = await createSavedView(supabase, "u1", {
      name: "  Ma   semaine ",
      href: "/all?view=cycle",
    });

    expect(result).toMatchObject({ ok: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: "u1",
      name: "Ma semaine",
      href: "/all?view=cycle",
    });
  });

  it("refuse un nom vide, sans rien écrire", async () => {
    const result = await createSavedView(supabase, "u1", {
      name: "   ",
      href: "/home",
    });

    expect(result).toEqual({ ok: false, status: 400, errorKey: "nameRequired" });
    expect(rows).toHaveLength(0);
  });

  it("refuse une adresse qui sort du site, sans rien écrire", async () => {
    for (const href of ["//evil.example/x", "https://evil.example", "home", ""]) {
      const result = await createSavedView(supabase, "u1", { name: "X", href });
      expect(result).toEqual({
        ok: false,
        status: 400,
        errorKey: "invalidViewHref",
      });
    }
    expect(rows).toHaveLength(0);
  });

  it("réenregistrer sous un nom connu DÉPLACE la vue au lieu d'en ajouter une", async () => {
    await createSavedView(supabase, "u1", { name: "Ma semaine", href: "/all" });
    await createSavedView(supabase, "u1", {
      name: "Ma semaine",
      href: "/all?view=cycle",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].href).toBe("/all?view=cycle");
  });

  it("le même nom chez un AUTRE compte est une autre vue", async () => {
    await createSavedView(supabase, "u1", { name: "Ma semaine", href: "/all" });
    await createSavedView(supabase, "u2", { name: "Ma semaine", href: "/home" });

    expect(rows).toHaveLength(2);
  });
});

describe("updateSavedView", () => {
  it("renomme", async () => {
    await createSavedView(supabase, "u1", { name: "Semaine", href: "/all" });

    const result = await updateSavedView(supabase, rows[0].id, {
      name: " Ma semaine ",
    });

    expect(result).toMatchObject({ ok: true });
    expect(rows[0].name).toBe("Ma semaine");
    // Renommer ne déplace pas la vue.
    expect(rows[0].href).toBe("/all");
  });

  it("refuse une adresse hors site à la mise à jour aussi", async () => {
    await createSavedView(supabase, "u1", { name: "Semaine", href: "/all" });

    const result = await updateSavedView(supabase, rows[0].id, {
      href: "//evil.example",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      errorKey: "invalidViewHref",
    });
    expect(rows[0].href).toBe("/all");
  });

  it("renommer sur un nom déjà pris se DIT, au lieu de tomber en panne", async () => {
    await createSavedView(supabase, "u1", { name: "Ma semaine", href: "/all" });
    await createSavedView(supabase, "u1", { name: "Perf", href: "/home" });
    const perf = rows.find((r) => r.name === "Perf")!;

    const result = await updateSavedView(supabase, perf.id, {
      name: "Ma semaine",
    });

    // 409, pas 500 : la création tranche toute seule (l'upsert déplace la vue
    // homonyme), mais un renommage qui écraserait une AUTRE vue la ferait
    // disparaître sans le dire.
    expect(result).toEqual({
      ok: false,
      status: 409,
      errorKey: "savedViewNameTaken",
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === perf.id)!.name).toBe("Perf");
  });

  it("une vue invisible (RLS) est introuvable, pas une erreur serveur", async () => {
    const result = await updateSavedView(supabase, "sv-inconnue", {
      name: "Peu importe",
    });

    expect(result).toEqual({ ok: false, status: 404, errorKey: "viewNotFound" });
  });

  it("refuse une mise à jour vide", async () => {
    await createSavedView(supabase, "u1", { name: "Semaine", href: "/all" });

    const result = await updateSavedView(supabase, rows[0].id, {});

    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});
