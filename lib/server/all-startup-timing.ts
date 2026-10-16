import "server-only";

// Explicit request admission only. Normal requests allocate no timing state.
export const ALL_STARTUP_DIAGNOSTIC_HEADER = "x-minddy-performance-diagnostic";
export const ALL_STARTUP_DIAGNOSTIC_VALUE = "all-startup-v1";
type Phase = "auth" | "cycles" | "issues" | "issues_db" | "issues_decode" | "projects" |
  "categories" | "objectives" | "relations" | "members" | "members_db" |
  "members_identity" | "members_avatar" | "integrations" | "integrations_decode" | "json";

export type AllStartupTiming = {
  span<T>(phase: Phase, operation: () => T | PromiseLike<T>): Promise<T>;
  sync<T>(phase: Phase, operation: () => T): T;
  decorate<T extends Response>(response: T): T;
};

/** Only fixed phase names, accumulated milliseconds and invocation counts leave the request. */
export function createAllStartupTiming(request: Pick<Request, "headers">): AllStartupTiming | undefined {
  if (request.headers.get(ALL_STARTUP_DIAGNOSTIC_HEADER) !== ALL_STARTUP_DIAGNOSTIC_VALUE) return undefined;
  const began = performance.now();
  const phases = new Map<Phase, { duration: number; count: number; start: number }>();
  const add = (phase: Phase, started: number) => {
    const duration = Math.max(0, performance.now() - started);
    const old = phases.get(phase) ?? { duration: 0, count: 0, start: Math.max(0, started - began) };
    phases.set(phase, { duration: old.duration + duration, count: old.count + 1, start: old.start });
  };
  return {
    async span(phase, operation) {
      const started = performance.now();
      try { return await operation(); }
      finally { add(phase, started); }
    },
    sync(phase, operation) {
      const started = performance.now();
      try { return operation(); }
      finally { add(phase, started); }
    },
    decorate(response) {
      const metrics = [`all_total;dur=${Math.max(0, performance.now() - began).toFixed(1)}`];
      for (const [phase, { duration, count, start }] of phases) metrics.push(`all_${phase};dur=${duration.toFixed(1)};desc="calls:${count},start:${start.toFixed(1)}"`);
      response.headers.set("Server-Timing", metrics.join(", "));
      return response;
    },
  };
}

/** The disabled branch calls the original operation directly, without another promise. */
export function measureAllStartupPhase<T>(timing: AllStartupTiming | undefined, phase: Phase,
  operation: () => T | PromiseLike<T>): T | PromiseLike<T> {
  return timing ? timing.span(phase, operation) : operation();
}
