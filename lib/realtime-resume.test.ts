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

  it("catches up after the threshold because an open socket may be dead", () => {
    expect(
      shouldCatchUpOnResume({ hiddenForMs: RESUME_AFTER_HIDDEN_MS })
    ).toBe(true);
  });

  // MIN-306: the floor is also valid when the socket has fallen. On macOS, a
  // window covered for half a second emits a `visibilitychange`; if the socket
  // is in backoff at this moment, the old branch “socket disconnected →
  // yes unconditionally" catches ALL perimeters while the user
  // work. The fallen channel is already catching up with its own upon re-subscription.
  it("does not catch up after a half-second occlusion while the socket is backing off", () => {
    expect(shouldCatchUpOnResume({ hiddenForMs: 500 })).toBe(false);
  });
});

/** Fake realtime client: counts gestures, does not simulate phoenix. */
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

  it("reconnects a closed socket without a probe", () => {
    const { realtime, calls } = fakeRealtime({ connected: false });
    expect(wakeRealtime(realtime)).toBeNull();
    expect(calls.connect).toBe(1);
    expect(calls.heartbeats).toBe(0);
  });

  it("refreshes the token on every wake-up — it may have expired while asleep", () => {
    const { realtime, calls } = fakeRealtime({ connected: false });
    wakeRealtime(realtime);
    expect(calls.setAuth).toBe(1);
  });

  it("concludes the socket is dead when the heartbeat remains unanswered", () => {
    vi.useFakeTimers();
    // `pendingHeartbeatRef` always set at the time of the probe: the socket does not
    // no longer responds. The second beat triggers the phoenix timeout, so the
    // disassembly and immediate reconnection.
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

  it("leaves a socket that responded alone", () => {
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
