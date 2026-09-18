// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearErrorHistory,
  formatStatusAge,
  MAX_STATUS_ERRORS,
  readErrorHistory,
  recordError,
  type StatusError,
} from "./status-history";

const error = (id: string, message: string, at: number): StatusError => ({
  id,
  message,
  at,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("the status-line error history", () => {
  it("records errors most recent first", () => {
    recordError(error("1", "First failure", 1_000));
    recordError(error("2", "Second failure", 2_000));
    const history = readErrorHistory();
    expect(history.map((e) => e.message)).toEqual(["Second failure", "First failure"]);
  });

  it("keeps at most 5 errors, dropping the oldest", () => {
    for (let i = 0; i < 7; i++) {
      recordError(error(String(i), `Failure ${i}`, i * 1_000));
    }
    const history = readErrorHistory();
    expect(history).toHaveLength(MAX_STATUS_ERRORS);
    expect(history[0].message).toBe("Failure 6");
    expect(history.map((e) => e.message)).not.toContain("Failure 0");
    expect(history.map((e) => e.message)).not.toContain("Failure 1");
  });

  it("re-ranks a repeated message instead of stacking it", () => {
    recordError(error("1", "Same failure", 1_000));
    recordError(error("2", "Other failure", 2_000));
    recordError(error("3", "Same failure", 3_000));
    const history = readErrorHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ id: "3", message: "Same failure", at: 3_000 });
  });

  it("starts empty on corrupt JSON", () => {
    window.localStorage.setItem("minddy:status-errors", "{not json");
    expect(readErrorHistory()).toEqual([]);
    // And recording recovers: the corrupt payload is replaced.
    recordError(error("1", "Failure", 1_000));
    expect(readErrorHistory()).toHaveLength(1);
  });

  it("clears everything", () => {
    recordError(error("1", "Failure", 1_000));
    clearErrorHistory();
    expect(readErrorHistory()).toEqual([]);
    expect(window.localStorage.getItem("minddy:status-errors")).toBeNull();
  });

  it("short-circuits without a window (server render)", () => {
    vi.stubGlobal("window", undefined);
    try {
      expect(readErrorHistory()).toEqual([]);
      expect(recordError(error("1", "Failure", 1_000))).toHaveLength(1);
      clearErrorHistory(); // must not throw
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("formatStatusAge", () => {
  const now = 1_800_000_000_000;
  const ago = (ms: number) => now - ms;

  it("says 'now' under a minute", () => {
    expect(formatStatusAge(ago(10_000), "en", now)).toMatchInlineSnapshot(`"now"`);
    expect(formatStatusAge(ago(10_000), "fr", now)).toMatchInlineSnapshot(`"maintenant"`);
  });

  it("counts minutes under an hour", () => {
    expect(formatStatusAge(ago(90_000), "en", now)).toMatchInlineSnapshot(`"2 minutes ago"`);
    expect(formatStatusAge(ago(90_000), "fr", now)).toMatchInlineSnapshot(`"il y a 2 minutes"`);
  });

  it("counts hours under a day", () => {
    expect(formatStatusAge(ago(90 * 60_000), "en", now)).toMatchInlineSnapshot(`"2 hours ago"`);
  });

  it("counts days, with yesterday as a word", () => {
    expect(formatStatusAge(ago(26 * 3_600_000), "en", now)).toMatchInlineSnapshot(`"yesterday"`);
    expect(formatStatusAge(ago(48 * 3_600_000), "en", now)).toMatchInlineSnapshot(`"2 days ago"`);
  });
});
