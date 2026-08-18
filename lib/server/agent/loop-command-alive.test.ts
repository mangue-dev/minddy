import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-224 — the death report of a loop that lives in the microVM.
 *
 * WHAT THIS FILE KEEPS, and it was written AFTER being fooled. The first
 * version read `Command.exitCode` and concluded "dead" if it was non-zero. It
 * passed all its tests, and it did not work: a command launched in
 * `detached: true` **never** sees its `exitCode` reconciled as long as no one
 * is waiting for it. Measured on a real microVM on 2026-08-07 — process killed for
 * eight minutes, missing `ps`, plus one event in the thread — the API was still rendering
 * `exitCode: null`. The watchdog therefore responded "alive" on ALL deaths, and a run whose loop dies remained `running` forever:
 * `requeueStuckRuns` excludes it by construction and `reapIdleSandboxes` only picks up
 * only idle runs. No one would have come.
 *
 * `wait()` is what reconciles. On the same dead process, it rendered in 270 ms
 * with `exitCode: 137`. So he is the observation — limited by OUR clock, so that the absence of response means “he is working” and nothing else.
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

/** A command that FINISHED: `wait()` renders immediately, like the real API. */
const finished = (exitCode: number) => ({
  exitCode: null as number | null,
  wait: async () => {
    h.waitCalls++;
    return { exitCode };
  },
});

/** A command that WORKS: `wait()` never returns, it only yields on abort. */
const working = () => ({
  exitCode: null as number | null,
  wait: (p?: { signal?: AbortSignal }) =>
    new Promise<never>((_, reject) => {
      h.waitCalls++;
      p?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
});

beforeEach(() => {
  vi.stubEnv("AGENT_EXECUTION_BACKEND", "vercel");
  vi.stubEnv("VERCEL", "1");
  h.command = null;
  h.getThrows = false;
  h.waitCalls = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("isLoopCommandAlive", () => {
  it("CONSTATE la mort d'une commande détachée dont l'exitCode n'est pas réconcilié", async () => {
    // The fault found in production: `exitCode` remains `null` on a dead process
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
    // API down, session expired. A watchdog who reads this as death
    // would restore towers to full health.
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
