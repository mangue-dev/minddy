import { afterEach, describe, expect, it, vi } from "vitest";

import { playLocalRunHere } from "./local-run-here";

/**
 * MIN-293 — LE MAILLON QUI MANQUAIT, et le défaut qu'il répare.
 *
 * Le sélecteur écrivait bien `local_exec = true`, le drain laissait le run
 * tranquille, le lanceur savait le jouer — et **rien n'appelait le lanceur**. Le
 * run restait `queued` sans que personne le réclame, ou partait en microVM sur un
 * serveur qui n'avait pas encore la garde du drain. Dans les deux cas :
 * l'utilisateur demande sa machine, obtient autre chose, et **rien ne le dit**.
 *
 * D'où les deux propriétés tenues ici : on ne déclenche que sur ce que la LIGNE
 * du run dit, et **tout refus rend un message**.
 */

function bridge(startLocalRun: unknown): void {
  vi.stubGlobal("window", { minddy: { startLocalRun } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playLocalRunHere", () => {
  it("ne fait RIEN, et ne dit rien, sur un run qui n'est pas local", async () => {
    const start = vi.fn();
    bridge(start);
    expect(await playLocalRunHere("run-1", false)).toBeNull();
    expect(await playLocalRunHere("run-1", undefined)).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it("suit la LIGNE du run, jamais la demande du composer", async () => {
    // Le serveur revalide (`localExecRequested`) : un run refusé pour sa nature —
    // ancrage `pr`, routine, chaîne, mention — repart dans le cloud. Suivre la
    // demande ferait attendre la machine sur un tour qui n'arrivera jamais.
    const start = vi.fn(async () => ({ status: "started", runId: "run-1", logPath: "/x" }));
    bridge(start);
    await playLocalRunHere("run-1", true);
    expect(start).toHaveBeenCalledWith({ runId: "run-1" });
  });

  it("dit quand il n'y a pas de coquille pour jouer le tour", async () => {
    vi.stubGlobal("window", {});
    const result = await playLocalRunHere("run-1", true);
    expect(result).toMatchObject({ ok: false });
    // La panne la plus silencieuse du chantier : la conversation s'ouvre, le fil
    // attend, et rien n'arrive. Le message doit nommer le geste qui répare.
    expect(result && !result.ok && result.message).toMatch(/desktop app/i);
  });

  it("relaie le motif du lanceur — c'est lui qui nomme le geste qui répare", async () => {
    bridge(async () => ({
      status: "refused",
      reason: "no_repo",
      message: "No local folder is attached to mangue-dev/minddy on this Mac.",
    }));
    const result = await playLocalRunHere("run-1", true);
    expect(result).toEqual({
      ok: false,
      message: "No local folder is attached to mangue-dev/minddy on this Mac.",
    });
  });

  it("reste lisible quand le lanceur refuse sans phrase", async () => {
    bridge(async () => ({ status: "refused", reason: "dev_only", message: "" }));
    const result = await playLocalRunHere("run-1", true);
    expect(result && !result.ok && result.message).toContain("dev_only");
  });

  it("dit aussi quand la coquille est plus ANCIENNE que la page", async () => {
    // Un `invoke` qui lève, c'est un main process sans le handler. Le silence
    // ferait croire à un tour parti.
    bridge(async () => {
      throw new Error("No handler registered for 'minddy:local-run:start'");
    });
    const result = await playLocalRunHere("run-1", true);
    expect(result).toMatchObject({ ok: false });
    expect(result && !result.ok && result.message).toContain("No handler registered");
  });

  it("ne dit rien quand le tour est bien parti", async () => {
    bridge(async () => ({ status: "started", runId: "run-1", logPath: "/x" }));
    expect(await playLocalRunHere("run-1", true)).toEqual({ ok: true });
  });
});
