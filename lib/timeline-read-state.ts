export type TimelineReadPhase = "loading" | "refreshing" | "paused" | "error" | "fresh";
interface Read {
  data: unknown;
  isPending: boolean;
  isError: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
}

/** An empty result is meaningful only after both authoritative reads succeed. */
export function timelineReadState(comments: Read, events: Read, online = true) {
  const reads = [comments, events];
  const phase: TimelineReadPhase = !online || reads.some((read) => read.fetchStatus === "paused") ? "paused"
    : reads.some((read) => read.isError) ? "error"
    : reads.some((read) => read.fetchStatus === "fetching") ? (reads.some((read) => read.isPending) ? "loading" : "refreshing")
    : reads.some((read) => read.isPending) ? "loading" : "fresh";
  return { phase };
}

export type TimelineReadState = ReturnType<typeof timelineReadState>;
