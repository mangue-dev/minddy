import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tools CARNET de l'agent de code (MIN-84, étendus en MIN-125). Ce qui se joue ici
 * est la protection d'un document PERSONNEL sans historique ni undo, écrit par un
 * agent autonome : une section inconnue doit dire lesquelles existent plutôt que
 * de créer un titre au hasard, et `set_scratchpad` — l'écrasement total — exige un
 * `rev` à jour, là où Numo chat et le MCP le laissent optionnel.
 *
 * Le carnet est simulé par une ligne unique en mémoire, avec le MÊME
 * compare-and-swap que la vraie table (`user_scratchpad.rev`).
 */

const { store } = vi.hoisted(() => ({ store: { content: "", rev: 0 } }));

// Fausse table `user_scratchpad` : le cœur de lib/server/scratchpad.ts tourne
// POUR DE VRAI par-dessus, compare-and-swap sur `rev` compris — c'est ce
// verrou-là que ces tests doivent voir refuser une écriture.
vi.mock("@/lib/supabase-service", () => {
  const row = () => ({
    content: store.content,
    updated_at: "2026-07-30T00:00:00Z",
    rev: store.rev,
  });
  const from = () => {
    const filters: Record<string, unknown> = {};
    let mode: "select" | "update" | "insert" = "select";
    let pending: { content?: string; rev?: number } = {};
    const query: Record<string, unknown> = {};
    query.select = () => query;
    query.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    query.update = (patch: { content: string; rev: number }) => {
      mode = "update";
      pending = patch;
      return query;
    };
    query.insert = (patch: { content: string; rev: number }) => {
      mode = "insert";
      pending = patch;
      return query;
    };
    query.maybeSingle = async () => {
      if (mode === "select") return { data: row(), error: null };
      // CAS : l'update ne matche aucune ligne si le `rev` attendu a bougé.
      if (mode === "update" && filters.rev !== store.rev) {
        return { data: null, error: null };
      }
      store.content = pending.content ?? "";
      store.rev = pending.rev ?? 0;
      return { data: row(), error: null };
    };
    return query;
  };
  return { getServiceClient: () => ({ from }) };
});

// Le ledger de stats est best-effort et hors sujet ici.
vi.mock("@/lib/server/stat-events", () => ({ insertStatEvents: async () => undefined }));

import { executeScratchpadTool } from "./scratchpad-tools";

const ctx = { userId: "user-1" };
const run = (name: string, args: Record<string, unknown> = {}) =>
  executeScratchpadTool(ctx, name, args);
const errorOf = (result: unknown) => String((result as { error?: string }).error ?? "");

beforeEach(() => {
  store.content = "## Aujourd'hui\n- [ ] Première tâche\n\n## Plus tard\n- [ ] Deuxième tâche\n";
  store.rev = 3;
});

describe("read_scratchpad", () => {
  it("rend le contenu, le rev et les tâches indexées", async () => {
    const out = await run("read_scratchpad");
    expect(out.success).toBe(true);
    expect(out.result).toMatchObject({ rev: 3 });
    expect((out.result as { tasks: unknown[] }).tasks).toHaveLength(2);
  });
});

describe("add_scratchpad_tasks", () => {
  it("ajoute à la fin du document et rend le compte", async () => {
    const out = await run("add_scratchpad_tasks", { tasks: [{ text: "Nouvelle tâche" }] });
    expect(out.success).toBe(true);
    expect(out.result).toMatchObject({ added: 1, rev: 4 });
    expect(store.content).toContain("- [ ] Nouvelle tâche");
  });

  it("ajoute sous une section existante", async () => {
    const out = await run("add_scratchpad_tasks", {
      tasks: [{ text: "Sous Aujourd'hui", state: "in_progress" }],
      section: "Aujourd'hui",
    });
    expect(out.success).toBe(true);
    expect(store.content).toMatch(
      /## Aujourd'hui\n- \[ \] Première tâche\n- \[~\] Sous Aujourd'hui/,
    );
  });

  it("sur une section inconnue, liste les sections existantes sans rien écrire", async () => {
    const before = store.content;
    const out = await run("add_scratchpad_tasks", {
      tasks: [{ text: "Perdue" }],
      section: "Inexistante",
    });
    expect(out.success).toBe(false);
    expect(errorOf(out.result)).toContain("Aujourd'hui");
    expect(errorOf(out.result)).toContain("Plus tard");
    expect(store.content).toBe(before);
  });

  it("refuse une liste vide ou un libellé vide", async () => {
    expect((await run("add_scratchpad_tasks", { tasks: [] })).success).toBe(false);
    expect((await run("add_scratchpad_tasks", { tasks: [{ text: "  " }] })).success).toBe(false);
  });
});

describe("update_scratchpad_task", () => {
  it("bascule l'état et renvoie `updated` (le fil compte dessus)", async () => {
    const out = await run("update_scratchpad_task", {
      tasks: [{ task_index: 1, state: "completed" }],
      expected_rev: 3,
    });
    expect(out.success).toBe(true);
    expect(out.result).toMatchObject({ updated: 1, rev: 4 });
    expect(store.content).toContain("- [x] Deuxième tâche");
  });

  it("refuse un `expected_rev` périmé sans rien écrire", async () => {
    const before = store.content;
    const out = await run("update_scratchpad_task", {
      tasks: [{ task_index: 0, state: "completed" }],
      expected_rev: 2,
    });
    expect(out.success).toBe(false);
    expect(errorOf(out.result)).toContain("read_scratchpad");
    expect(store.content).toBe(before);
  });

  it("rejette TOUT le lot sur un index hors bornes", async () => {
    const before = store.content;
    const out = await run("update_scratchpad_task", {
      tasks: [
        { task_index: 0, state: "completed" },
        { task_index: 9, state: "completed" },
      ],
    });
    expect(out.success).toBe(false);
    expect(errorOf(out.result)).toContain("out of range");
    expect(store.content).toBe(before);
  });
});

describe("set_scratchpad — l'écrasement total est gardé", () => {
  it("exige `expected_rev`", async () => {
    const before = store.content;
    const out = await run("set_scratchpad", { content: "# Tout neuf" });
    expect(out.success).toBe(false);
    expect(errorOf(out.result)).toContain("expected_rev");
    expect(store.content).toBe(before);
  });

  it("refuse un `rev` périmé sans écrire", async () => {
    const before = store.content;
    const out = await run("set_scratchpad", { content: "# Écrasé", expected_rev: 2 });
    expect(out.success).toBe(false);
    expect(errorOf(out.result)).toMatch(/read_scratchpad/);
    expect(store.content).toBe(before);
  });

  it("réécrit le carnet sur un `rev` à jour — la voie pour SUPPRIMER une tâche", async () => {
    const out = await run("set_scratchpad", {
      content: "## Aujourd'hui\n- [ ] Première tâche\n",
      expected_rev: 3,
    });
    expect(out.success).toBe(true);
    expect(out.result).toMatchObject({ rev: 4 });
    expect(store.content).not.toContain("Deuxième tâche");
  });

  it("accepte une chaîne vide (effacement) mais pas un `content` absent", async () => {
    expect((await run("set_scratchpad", { expected_rev: 3 })).success).toBe(false);
    const out = await run("set_scratchpad", { content: "", expected_rev: 3 });
    expect(out.success).toBe(true);
    expect(store.content).toBe("");
  });
});

describe("run sans propriétaire", () => {
  it("dit qu'il n'y a pas de carnet, plutôt que de jeter", async () => {
    const out = await executeScratchpadTool({ userId: null }, "read_scratchpad", {});
    expect(out.success).toBe(false);
    expect(errorOf(out.result)).toContain("no owner");
  });
});
