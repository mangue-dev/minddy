/**
 * Resumption after an absence: what to do when the tab returns to
 * foreground (tab change, machine wakes up).
 *
 * The problem is that NO ONE does it for us:
 *
 * - `refetchOnWindowFocus` is false (lib/query-provider.tsx) — freshness
 * is supposed to come from the real-time bridge, not the clock;
 * - `refetchOnReconnect` only listens for the browser's `online` event, a
 * sleeps or a frozen tab never emits;
 * - the socket remained… that is to say precisely what had just died.
 *
 * And it took a while to notice it. A hidden tab sees its timers
 * frozen (Chrome switches them to one per minute after five minutes, then freezes
 * the tab altogether): the 25 s heartbeat no longer starts, and phoenix only concludes
 * death after a complete round trip — 25 s to send the beat
 * next, 25 sec more to declare it lost — before rejoining with a
 * backoff of 1 → 2 → 5 → 10 sec. Hence the ten seconds of expired status at
 * the screen upon return, during which the user reads false data
 * without any indicator telling him so.
 *
 * The answer is in one sentence: **on return, we do not ask the
 * anything. socket.** We refetch immediately (this is what the user sees), and on
 * wakes up the socket in parallel. What it will bring back afterwards is a bonus.
 *
 * Separated from the provider to be testable: vitest runs on bare node, without React
 * nor browser (same reason as lib/realtime-topics.ts).
 */

/**
 * Below this absence, a socket that says it is connected really is:
 * we do not refetch. Above, she was able to die silently while the
 * timers froze — the doubt is enough to justify a handful of GET.
 */
export const RESUME_AFTER_HIDDEN_MS = 15_000;

/** Delay before concluding that an unanswered heartbeat will never come. */
export const ZOMBIE_PROBE_MS = 3_000;

/**
 * Should we catch the caches on return?
 *
 * **Only one condition, the duration.** The state of the socket no longer participates.
 *
 * He did it: "a fallen socket is an unconditional yes, whatever summer
 * duration”. This branch had no floor, and `isConnected()` is
 * false during ANY phoenix reconnection in progress (backoff 1 → 2 → 5 → 10 s).
 * On macOS, a fully covered window goes into occlusion and issues a
 * `visibilitychange`: an occlusion of half a second — another window which
 * passes in front, a change of space — was then sufficient to trigger the
 * complete catch-up of all perimeters, if the socket was in backoff
 * at that moment. Two independent events, none of which are caused by
 * the user, but which fall while he is working (MIN-306).
 *
 * ⚠ **This is not an oversight, and it does not create any freshness hole**: a channel
 * that fell then rejoined already catches up with its own perimeter of itself, upon re-subscription (see `openScope` in lib/realtime-provider.tsx). Resetting a
 * “unconditional yes” here would do nothing, and would reopen the default.
 */
export function shouldCatchUpOnResume({
  hiddenForMs,
}: {
  hiddenForMs: number;
}): boolean {
  return hiddenForMs >= RESUME_AFTER_HIDDEN_MS;
}

/** What we use from a realtime socket — enough to test it with a fake. */
export interface WakeableRealtime {
  isConnected(): boolean;
  connect(): void;
  setAuth(token?: string | null): Promise<void>;
  sendHeartbeat(): Promise<void>;
  readonly pendingHeartbeatRef: string | null;
}

/**
 * Wakes up the socket without waiting for it to notice its own death.
 *
 * Three gestures, all in public API:
 *
 * 1. `setAuth()` — the JWT could have expired during sleep, and a join de
 * private channel presented with an expired token is refused, which restarts the
 * backoff for nothing.
 * 2. closed socket → `connect()`, which does nothing if a reconnection is already
 * in flight.
 * 3. socket “open” but perhaps zombie → we write on him. A first
 * beat leaves; if it still has no response {@link ZOMBIE_PROBE_MS}
 * later, the second triggers phoenix timeout logic, which
 * unmounts and reschedules an immediate reconnection. Detection in ~3 s instead of 50.
 *
 * Returns the probe timer, to be canceled on disassembly (null if none is needed).
 */
export function wakeRealtime(
  realtime: WakeableRealtime
): ReturnType<typeof setTimeout> | null {
  // Deliberately not expected: catching up with caches does not depend on it.
  void realtime.setAuth().catch(() => {});

  if (!realtime.isConnected()) {
    realtime.connect();
    return null;
  }

  void realtime.sendHeartbeat();
  return setTimeout(() => {
    // Still waiting: the socket no longer responds, we force the conclusion.
    if (realtime.pendingHeartbeatRef) void realtime.sendHeartbeat();
  }, ZOMBIE_PROBE_MS);
}
