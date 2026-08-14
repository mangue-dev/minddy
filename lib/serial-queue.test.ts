import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./serial-queue";

/** Une promesse qu'on résout à la main, pour tenir une tâche ouverte. */
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

    // « a » tient la file : « b » n'a pas encore été appelée.
    await Promise.resolve();
    expect(started).toEqual(["a"]);

    first.resolve();
    await Promise.all([a, b]);
    expect(started).toEqual(["a", "b"]);
  });

  // Le cas qui a motivé la file (MIN-353) : le DELETE du pointeur part avant le
  // PUT, et doit être TRAITÉ avant lui — sinon la base perd le pointeur d'un
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

    // Le rejet est absorbé : la promesse rendue ne rejette pas, et ce qui suit
    // s'exécute quand même.
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
