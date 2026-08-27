import { afterEach, describe, expect, it, vi } from "vitest";

const { close, openPageWatch } = vi.hoisted(() => {
  const close = vi.fn();
  return { close, openPageWatch: vi.fn(() => ({ close })) };
});

vi.mock("./page-watch", () => ({ openPageWatch }));

import { retainPageWatch } from "./use-page-watch";

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("retainPageWatch", () => {
  it("reuses a watch when Strict Mode remounts before deferred cleanup", () => {
    vi.useFakeTimers();
    const firstRelease = retainPageWatch("project-1", "page-1");
    firstRelease();
    const secondRelease = retainPageWatch("project-1", "page-1");

    vi.runAllTimers();
    expect(openPageWatch).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();

    secondRelease();
    vi.runAllTimers();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps different pages isolated", () => {
    vi.useFakeTimers();
    const releaseA = retainPageWatch("project-1", "page-a");
    const releaseB = retainPageWatch("project-1", "page-b");

    expect(openPageWatch).toHaveBeenCalledTimes(2);
    releaseA();
    vi.runAllTimers();
    expect(close).toHaveBeenCalledTimes(1);

    releaseB();
    vi.runAllTimers();
    expect(close).toHaveBeenCalledTimes(2);
  });
});
