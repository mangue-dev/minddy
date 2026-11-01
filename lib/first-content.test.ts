import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIRST_CONTENT_MAX_WAIT_MS,
  hasReachedFirstContent,
  onFirstContent,
  resetFirstContentForTests,
  watchFirstContent,
} from "./first-content";

/** A query client reduced to what the watcher reads. */
function reads() {
  let fetching = 0;
  const listeners = new Set<() => void>();
  return {
    set(count: number) { fetching = count; for (const listener of listeners) listener(); },
    isFetching: () => fetching,
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  resetFirstContentForTests();
  vi.useRealTimers();
});

describe("first content", () => {
  it("is reached when the startup reads settle, not before they start", () => {
    const client = reads();
    const listener = vi.fn();
    onFirstContent(listener);
    watchFirstContent({ ...client, showsContent: () => true, target: undefined });
    expect(hasReachedFirstContent()).toBe(false);
    client.set(3);
    client.set(1);
    expect(listener).not.toHaveBeenCalled();
    client.set(0);
    expect(listener).toHaveBeenCalledOnce();
    // Later waves change nothing: it is reached once per page.
    client.set(2);
    client.set(0);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("waits for the page to leave its skeleton when the reads settle first", () => {
    const client = reads();
    let skeleton = true;
    watchFirstContent({ ...client, showsContent: () => !skeleton, target: undefined });
    client.set(2);
    client.set(0);
    vi.advanceTimersByTime(300);
    expect(hasReachedFirstContent()).toBe(false);
    skeleton = false;
    vi.advanceTimersByTime(100);
    expect(hasReachedFirstContent()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is reached at the first user intent, so an early gesture loads its surface", () => {
    const client = reads();
    const target = new EventTarget();
    watchFirstContent({ ...client, target: target as unknown as Window });
    client.set(4);
    target.dispatchEvent(new Event("pointerdown"));
    expect(hasReachedFirstContent()).toBe(true);
  });

  it("never waits beyond the cap on a read that does not settle", () => {
    const client = reads();
    watchFirstContent({ ...client, target: undefined });
    client.set(1);
    vi.advanceTimersByTime(FIRST_CONTENT_MAX_WAIT_MS - 1);
    expect(hasReachedFirstContent()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(hasReachedFirstContent()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("runs a late listener at once and lets a pending one cancel", () => {
    const early = vi.fn();
    const cancel = onFirstContent(early);
    cancel();
    watchFirstContent({ ...reads(), target: undefined });
    vi.advanceTimersByTime(FIRST_CONTENT_MAX_WAIT_MS);
    expect(early).not.toHaveBeenCalled();
    const late = vi.fn();
    onFirstContent(late);
    expect(late).toHaveBeenCalledOnce();
  });
});
