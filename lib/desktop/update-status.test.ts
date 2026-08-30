import { describe, expect, it } from "vitest";
import {
  IDLE_UPDATE_STATUS,
  reduceUpdateStatus,
  type DesktopUpdateStatus,
} from "./update-status";

const READY: DesktopUpdateStatus = { state: "ready", version: "0.9.5" };

describe("reduceUpdateStatus", () => {
  it("announces the download as soon as a version is detected", () => {
    expect(
      reduceUpdateStatus(IDLE_UPDATE_STATUS, { kind: "available", version: "0.9.5" })
    ).toEqual({ state: "downloading", version: "0.9.5" });
  });

  it("becomes ready when the update is on disk", () => {
    expect(
      reduceUpdateStatus(
        { state: "downloading", version: "0.9.5" },
        { kind: "downloaded", version: "0.9.5" }
      )
    ).toEqual(READY);
  });

  it("does not revert an already ready version to downloading", () => {
    // The six-hour check can announce the same version again before another
    // downloaded event. The ready state must remain actionable.
    expect(reduceUpdateStatus(READY, { kind: "available", version: "0.9.5" })).toBe(
      READY
    );
  });

  it("tracks a newer version after a previously ready one", () => {
    expect(
      reduceUpdateStatus(READY, { kind: "available", version: "0.9.6" })
    ).toEqual({ state: "downloading", version: "0.9.6" });
  });

  it("keeps a ready update when the next check fails", () => {
    // The file is on the disk: a cut network does not remove it, and
    // removing the line would erase the only way to install.
    expect(reduceUpdateStatus(READY, { kind: "error" })).toBe(READY);
  });

  it("returns to idle when a download check fails", () => {
    expect(
      reduceUpdateStatus({ state: "downloading", version: "0.9.5" }, { kind: "error" })
    ).toEqual(IDLE_UPDATE_STATUS);
  });

});
