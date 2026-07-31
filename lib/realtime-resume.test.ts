import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RESUME_AFTER_HIDDEN_MS,
  ZOMBIE_PROBE_MS,
  shouldCatchUpOnResume,
  wakeRealtime,
  type WakeableRealtime,
} from "./realtime-resume";

describe("shouldCatchUpOnResume", () => {
  it("rattrape dès que la socket est tombée, même sur une absence courte", () => {
    expect(
      shouldCatchUpOnResume({ hiddenForMs: 0, socketConnected: false })
    ).toBe(true);
  });

  it("ne rattrape pas un aller-retour d'onglet avec une socket vivante", () => {
    expect(
      shouldCatchUpOnResume({ hiddenForMs: 2_000, socketConnected: true })
    ).toBe(false);
  });

  it("rattrape passé le seuil, une socket ouverte pouvant être morte", () => {
    expect(
      shouldCatchUpOnResume({
        hiddenForMs: RESUME_AFTER_HIDDEN_MS,
        socketConnected: true,
      })
    ).toBe(true);
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
