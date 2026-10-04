import { describe, expect, it } from "vitest";
import { timelineReadState } from "./timeline-read-state";

const fresh = { data: [], isPending: false, isError: false, fetchStatus: "idle" as const };
describe("authoritative timeline read state", () => {
  it("requires both reads to succeed before an empty timeline is fresh", () => {
    const initial = { ...fresh, data: undefined, isPending: true, fetchStatus: "fetching" as const };
    expect(timelineReadState(initial, initial)).toEqual({ phase: "loading", hasPreviousData: false });
    expect(timelineReadState(fresh, initial).phase).toBe("loading");
    expect(timelineReadState(fresh, fresh).phase).toBe("fresh");
  });
  it("distinguishes retained data, refresh failures and paused reconnects", () => {
    expect(timelineReadState({ ...fresh, fetchStatus: "fetching" }, fresh).phase).toBe("refreshing");
    expect(timelineReadState(fresh, { ...fresh, isError: true })).toEqual({ phase: "error", hasPreviousData: true });
    expect(timelineReadState({ ...fresh, data: undefined, isError: true }, { ...fresh, data: undefined })).toEqual({ phase: "error", hasPreviousData: false });
    expect(timelineReadState({ ...fresh, fetchStatus: "paused" }, fresh).phase).toBe("paused");
    expect(timelineReadState(fresh, fresh, false).phase).toBe("paused");
  });
});
