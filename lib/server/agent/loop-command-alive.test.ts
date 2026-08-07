import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-224 — le constat de décès d'une boucle qui vit dans la microVM.
 *
 * CE QUE CE FICHIER GARDE, et il a été écrit APRÈS s'être fait avoir. La première
 * version lisait `Command.exitCode` et concluait « mort » s'il était non nul. Elle
 * a passé tous ses tests, et elle ne marchait pas : une commande lancée en
 * `detached: true` ne voit **jamais** son `exitCode` réconcilié tant que personne
 * ne l'attend. Mesuré sur une vraie microVM le 2026-08-07 — process tué depuis
 * huit minutes, absent de `ps`, plus un event dans le fil — l'API rendait encore
 * `exitCode: null`. Le chien de garde répondait donc « vivant » sur TOUS les
 * décès, et un run dont la boucle meurt restait `running` pour toujours :
 * `requeueStuckRuns` l'exclut par construction et `reapIdleSandboxes` ne ramasse
 * que les runs au repos. Personne ne serait venu.
 *
 * `wait()` est ce qui réconcilie. Sur le même process mort, il a rendu en 270 ms
 * avec `exitCode: 137`. C'est donc lui le constat — borné par NOTRE horloge, pour
 * que l'absence de réponse veuille dire « il travaille » et rien d'autre.
 */

const h = vi.hoisted(() => ({
  /** Ce que `getCommand` rend. `null` = commande introuvable. */
  command: null as null | { exitCode: number | null; wait: (p?: { signal?: AbortSignal }) => Promise<unknown> },
  getThrows: false,
  waitCalls: 0,
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    get: vi.fn(async () => {
      if (h.getThrows) throw new Error("sandbox not found");
      return { getCommand: vi.fn(async () => h.command) };
    }),
  },
}));

const { isLoopCommandAlive } = await import("./sandbox");

/** Une commande qui a FINI : `wait()` rend tout de suite, comme la vraie API. */
const finished = (exitCode: number) => ({
  exitCode: null as number | null,
  wait: async () => {
    h.waitCalls++;
    return { exitCode };
  },
});

/** Une commande qui TRAVAILLE : `wait()` ne rend jamais, il ne cède qu'à l'abandon. */
const working = () => ({
  exitCode: null as number | null,
  wait: (p?: { signal?: AbortSignal }) =>
    new Promise<never>((_, reject) => {
      h.waitCalls++;
      p?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
});

beforeEach(() => {
  h.command = null;
  h.getThrows = false;
  h.waitCalls = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("isLoopCommandAlive", () => {
  it("CONSTATE la mort d'une commande détachée dont l'exitCode n'est pas réconcilié", async () => {
    // Le défaut trouvé en production : `exitCode` reste `null` sur un process mort
    // depuis des minutes. Sans `wait()`, cette ligne rendait `true`.
    h.command = finished(137);
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(false);
    expect(h.waitCalls, "il faut avoir demandé à `wait()`").toBe(1);
  });

  it("croit l'`exitCode` quand il est là, sans rien demander de plus", async () => {
    h.command = { ...finished(0), exitCode: 0 };
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(false);
    expect(h.waitCalls, "rien à attendre : la plateforme a déjà répondu").toBe(0);
  });

  it("rend `true` quand le process travaille encore — c'est le DÉLAI qui répond", async () => {
    vi.useFakeTimers();
    h.command = working();
    const verdict = isLoopCommandAlive("agent-x", "cmd-1");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await verdict).toBe(true);
  });

  it("ne conclut RIEN quand `wait()` échoue pour une autre raison que notre délai", async () => {
    // API en panne, session expirée. Un chien de garde qui lit ça comme une mort
    // remettrait au repos des tours en pleine santé.
    h.command = {
      exitCode: null,
      wait: async () => {
        throw new Error("upstream 503");
      },
    };
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(null);
  });

  it("ne conclut RIEN quand la microVM est introuvable", async () => {
    h.getThrows = true;
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(null);
  });

  it("ne conclut RIEN quand la commande est introuvable", async () => {
    h.command = null;
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(null);
  });
});
