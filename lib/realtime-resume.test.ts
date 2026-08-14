import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RESUME_AFTER_HIDDEN_MS,
  ZOMBIE_PROBE_MS,
  shouldCatchUpOnResume,
  wakeRealtime,
  type WakeableRealtime,
} from "./realtime-resume";

describe("shouldCatchUpOnResume", () => {
  it("ne rattrape pas un aller-retour d'onglet", () => {
    expect(shouldCatchUpOnResume({ hiddenForMs: 2_000 })).toBe(false);
  });

  it("rattrape passé le seuil, une socket ouverte pouvant être morte", () => {
    expect(
      shouldCatchUpOnResume({ hiddenForMs: RESUME_AFTER_HIDDEN_MS })
    ).toBe(true);
  });

  // MIN-306 : le plancher vaut aussi quand la socket est tombée. Sur macOS, une
  // fenêtre recouverte une demi-seconde émet un `visibilitychange` ; si la socket
  // se trouve en backoff à cet instant, l'ancienne branche « socket déconnectée →
  // oui sans condition » rattrapait TOUS les périmètres pendant que l'utilisateur
  // travaille. Le canal tombé rattrape déjà le sien à la re-souscription.
  it("ne rattrape pas une occlusion d'une demi-seconde, socket en backoff", () => {
    expect(shouldCatchUpOnResume({ hiddenForMs: 500 })).toBe(false);
  });
});

/** Faux client realtime : compte les gestes, ne simule pas phoenix. */
function fakeRealtime(
  overrides: Partial<WakeableRealtime> & { connected: boolean }
) {
  const calls = { connect: 0, heartbeats: 0, setAuth: 0 };
  const realtime: WakeableRealtime = {
    isConnected: () => overrides.connected,
    connect: () => {
      calls.connect += 1;
    },
    setAuth: async () => {
      calls.setAuth += 1;
    },
    sendHeartbeat: async () => {
      calls.heartbeats += 1;
    },
    pendingHeartbeatRef: overrides.pendingHeartbeatRef ?? null,
  };
  return { realtime, calls };
}

describe("wakeRealtime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconnecte une socket fermée, sans sonde", () => {
    const { realtime, calls } = fakeRealtime({ connected: false });
    expect(wakeRealtime(realtime)).toBeNull();
    expect(calls.connect).toBe(1);
    expect(calls.heartbeats).toBe(0);
  });

  it("repousse le jeton à chaque réveil — il a pu expirer pendant la veille", () => {
    const { realtime, calls } = fakeRealtime({ connected: false });
    wakeRealtime(realtime);
    expect(calls.setAuth).toBe(1);
  });

  it("conclut à la mort quand le battement reste sans réponse", () => {
    vi.useFakeTimers();
    // `pendingHeartbeatRef` toujours posé à l'heure de la sonde : la socket ne
    // répond plus. Le second battement déclenche le timeout de phoenix, donc le
    // démontage et la reconnexion immédiate.
    const { realtime, calls } = fakeRealtime({
      connected: true,
      pendingHeartbeatRef: "42",
    });
    const probe = wakeRealtime(realtime);
    expect(probe).not.toBeNull();
    expect(calls.heartbeats).toBe(1);
    vi.advanceTimersByTime(ZOMBIE_PROBE_MS);
    expect(calls.heartbeats).toBe(2);
  });

  it("laisse tranquille une socket qui a répondu", () => {
    vi.useFakeTimers();
    const { realtime, calls } = fakeRealtime({
      connected: true,
      pendingHeartbeatRef: null,
    });
    wakeRealtime(realtime);
    vi.advanceTimersByTime(ZOMBIE_PROBE_MS);
    expect(calls.heartbeats).toBe(1);
  });
});
