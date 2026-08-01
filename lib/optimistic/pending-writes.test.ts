import { describe, expect, it } from "vitest";
import { createPendingWrites } from "./pending-writes";

interface Row {
  id: string;
  status: string;
  updated_at: string;
}

const row = (id: string, status: string, updatedAt = "t0"): Row => ({
  id,
  status,
  updated_at: updatedAt,
});

/** Horloge simulée : `clock.at` est l'instant que `now()` renvoie. */
function fixture(retentionMs = 30_000) {
  const clock = { at: 1_000 };
  const writes = createPendingWrites<Row>({
    now: () => clock.at,
    retentionMs,
  });
  return { clock, writes };
}

describe("createPendingWrites", () => {
  it("garde le patch quand la réponse est partie avant la confirmation", () => {
    const { clock, writes } = fixture();
    const startedAt = clock.at; // le GET part…
    const handle = writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });
    clock.at += 50;
    writes.settle(handle); // …et le PATCH est confirmé APRÈS son départ.

    // La réponse porte encore l'ancien état : l'overlay le corrige.
    expect(writes.apply([row("a", "todo")], startedAt)).toEqual([
      { id: "a", status: "done", updated_at: "t0" },
    ]);
  });

  it("relâche le patch quand la réponse est partie après la confirmation", () => {
    const { clock, writes } = fixture();
    const handle = writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });
    clock.at += 50;
    writes.settle(handle);
    clock.at += 10;
    const startedAt = clock.at; // GET parti APRÈS la confirmation : il fait foi.

    const rows = [row("a", "todo")];
    expect(writes.apply(rows, startedAt)).toBe(rows);
  });

  it("oublie l'entrée immédiatement quand l'écriture échoue", () => {
    const { clock, writes } = fixture();
    const startedAt = clock.at;
    const handle = writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });
    clock.at += 50;
    writes.fail(handle);

    const rows = [row("a", "todo")];
    expect(writes.apply(rows, startedAt)).toBe(rows);
  });

  it("fait gagner la dernière écriture sur un même id", () => {
    const { clock, writes } = fixture();
    const startedAt = clock.at;
    writes.begin({ kind: "patch", id: "a", patch: { status: "in_progress" } });
    clock.at += 5;
    writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });

    expect(writes.apply([row("a", "todo")], startedAt)).toEqual([
      { id: "a", status: "done", updated_at: "t0" },
    ]);
  });

  it("purge les entrées confirmées passé le délai de rétention", () => {
    const { clock, writes } = fixture(30_000);
    const startedAt = clock.at;
    const handle = writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });
    clock.at += 50;
    writes.settle(handle, row("a", "done", "t1"));

    // Toujours là juste après la confirmation…
    expect(writes.apply([row("a", "todo")], startedAt)[0].status).toBe("done");
    expect(writes.wasJustWritten("a", { id: "a", updated_at: "t1" })).toBe(true);

    clock.at += 30_001;
    const rows = [row("a", "todo")];
    expect(writes.apply(rows, startedAt)).toBe(rows);
    expect(writes.wasJustWritten("a", { id: "a", updated_at: "t1" })).toBe(false);
  });

  // La diffusion part du trigger AU COMMIT : elle arrive typiquement AVANT la
  // réponse HTTP du PATCH, donc avant qu'aucune empreinte n'ait été mémorisée.
  it("reconnaît l'écho d'une écriture encore en vol, sans empreinte", () => {
    const { clock, writes } = fixture();
    const handle = writes.begin({ kind: "patch", id: "a", patch: { status: "done" } });

    // Pas encore de `settle` : ni id ni updated_at mémorisés.
    expect(writes.wasJustWritten("a", { id: "a", updated_at: "t9" })).toBe(true);
    // Une ligne de liaison sans `updated_at` compte aussi (issue_categories).
    expect(writes.wasJustWritten("a")).toBe(true);
    // Une autre ligne, elle, n'est pas la nôtre.
    expect(writes.wasJustWritten("b", { id: "b", updated_at: "t9" })).toBe(false);

    clock.at += 50;
    writes.settle(handle, row("a", "done", "t1"));
    // Confirmée : seule l'empreinte exacte matche désormais.
    expect(writes.wasJustWritten("a", { id: "a", updated_at: "t1" })).toBe(true);
    expect(writes.wasJustWritten("a", { id: "a", updated_at: "t2" })).toBe(false);
  });

  it("ne duplique pas un insert que la réponse contient déjà", () => {
    const { clock, writes } = fixture();
    const startedAt = clock.at;
    writes.begin({ kind: "insert", row: row("new", "todo") });

    // Réponse sans la ligne : on l'ajoute.
    expect(writes.apply([row("a", "todo")], startedAt).map((r) => r.id)).toEqual([
      "a",
      "new",
    ]);
    // Réponse qui la contient déjà : elle fait foi, pas de doublon.
    const withRow = [row("a", "todo"), row("new", "todo")];
    expect(writes.apply(withRow, startedAt)).toBe(withRow);
  });

  it("applique un remove puis le relâche une fois la réponse à jour", () => {
    const { clock, writes } = fixture();
    const startedAt = clock.at;
    const handle = writes.begin({ kind: "remove", id: "a" });

    expect(writes.apply([row("a", "todo"), row("b", "todo")], startedAt)).toEqual([
      { id: "b", status: "todo", updated_at: "t0" },
    ]);

    clock.at += 50;
    writes.settle(handle);
    clock.at += 10;
    // La ligne a vraiment disparu côté serveur : la réponse suivante s'impose.
    const rows = [row("b", "todo")];
    expect(writes.apply(rows, clock.at)).toBe(rows);
  });
});
