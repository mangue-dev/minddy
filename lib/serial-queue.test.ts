import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./serial-queue";

/** A promise that is resolved by hand, to keep an open task. */
function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSerialQueue", () => {
  it("ne démarre la suivante qu'après la fin de la précédente", async () => {
    const enqueue = createSerialQueue();
    const first = deferred();
    const started: string[] = [];

    const a = enqueue(async () => {
      started.push("a");
      await first.promise;
    });
    const b = enqueue(async () => {
      started.push("b");
    });

    // “a” is holding the queue: “b” has not yet been called.
    await Promise.resolve();
    expect(started).toEqual(["a"]);

    first.resolve();
    await Promise.all([a, b]);
    expect(started).toEqual(["a", "b"]);
  });

  // The case which motivated the queue (MIN-353): the DELETE of the pointer leaves before the
  // PUT, and must be PROCESSED before it — otherwise the base loses the pointer of a
  // fil bien vivant.
  it("préserve l'ordre même quand la première tâche est la plus lente", async () => {
    const enqueue = createSerialQueue();
    const done: string[] = [];
    const slow = deferred();

    const del = enqueue(async () => {
      await slow.promise;
      done.push("delete");
    });
    const put = enqueue(async () => {
      done.push("put");
    });

    slow.resolve();
    await Promise.all([del, put]);
    expect(done).toEqual(["delete", "put"]);
  });

  it("poursuit la file quand une tâche échoue", async () => {
    const enqueue = createSerialQueue();
    const done: string[] = [];

    const failing = enqueue(async () => {
      throw new Error("réseau coupé");
    });
    const after = enqueue(async () => {
      done.push("suivante");
    });

    // Rejection is absorbed: the promise given does not reject, and what follows
    // executes anyway.
    await expect(failing).resolves.toBeUndefined();
    await after;
    expect(done).toEqual(["suivante"]);
  });

  it("garde chaque file indépendante", async () => {
    const one = createSerialQueue();
    const two = createSerialQueue();
    const held = deferred();
    const started: string[] = [];

    const blocked = one(async () => {
      started.push("un");
      await held.promise;
    });
    const free = two(async () => {
      started.push("deux");
    });

    await free;
    expect(started).toEqual(["un", "deux"]);

    held.resolve();
    await blocked;
  });
});
