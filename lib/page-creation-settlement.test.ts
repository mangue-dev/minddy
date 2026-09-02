import { describe, expect, it, vi } from "vitest";

import {
  afterPageCreation,
  isPageCreationPending,
  trackPageCreation,
  waitForPageCreation,
} from "./page-creation-settlement";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("page creation settlement", () => {
  it("orders normal and unload work after creation", async () => {
    const creation = deferred<void>();
    const operation = vi.fn();
    trackPageCreation("page-ordered", creation.promise);
    expect(isPageCreationPending("page-ordered")).toBe(true);

    const waiting = waitForPageCreation("page-ordered").then(operation);
    afterPageCreation("page-ordered", operation);
    expect(operation).not.toHaveBeenCalled();

    creation.resolve();
    await waiting;
    await creation.promise;
    expect(operation).toHaveBeenCalledTimes(2);
    expect(isPageCreationPending("page-ordered")).toBe(false);
  });

  it("drops unload work and propagates a rejected creation", async () => {
    const creation = deferred<void>();
    const operation = vi.fn();
    const settlement = trackPageCreation("page-rejected", creation.promise);
    afterPageCreation("page-rejected", operation);

    const failure = new Error("Create failed");
    creation.reject(failure);

    await expect(settlement).rejects.toBe(failure);
    expect(operation).not.toHaveBeenCalled();
  });

  it("runs immediately when no creation is pending", () => {
    const operation = vi.fn();
    afterPageCreation("existing-page", operation);
    expect(operation).toHaveBeenCalledOnce();
  });
});
