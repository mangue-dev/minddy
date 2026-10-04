import { describe, expect, it, vi } from "vitest";
import { MaintenanceRunner } from "./maintenance-runner";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("bounded encryption maintenance", () => {
  it("caps all passes and runs unrelated domains alongside one shared bundle", async () => {
    const runner = new MaintenanceRunner(new AbortController().signal, 3);
    let active = 0;
    let bundles = 0;
    let maximum = 0;
    let maximumBundles = 0;
    const release: Array<() => void> = [];
    for (let index = 0; index < 8; index++) {
      const shared = index < 4;
      runner.schedule(async () => {
        active++;
        bundles += Number(shared);
        maximum = Math.max(maximum, active);
        maximumBundles = Math.max(maximumBundles, bundles);
        await new Promise<void>((resolve) => release.push(resolve));
        active--;
        bundles -= Number(shared);
        return index;
      }, shared);
    }
    const pending = runner.run(0);
    await tick();
    expect(active).toBe(3);
    expect(bundles).toBe(1);
    while (release.length) {
      release.splice(0).forEach((resolve) => resolve());
      await tick();
    }
    expect((await pending).map((outcome) => outcome.status === "fulfilled" && outcome.value))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(maximum).toBe(3);
    expect(maximumBundles).toBe(1);
  });

  it("rotates domain priority between hours while preserving result order", async () => {
    for (const hour of [0, 1, 2, 3]) {
      const runner = new MaintenanceRunner(new AbortController().signal, 1);
      const started: number[] = [];
      for (let index = 0; index < 4; index++) runner.schedule(async () => {
        started.push(index);
        return index;
      });
      const results = await runner.run(hour);
      expect(started).toEqual(Array.from({ length: 4 }, (_, index) => (hour + index) % 4));
      expect(results.map((result) => result.status === "fulfilled" && result.value)).toEqual([0, 1, 2, 3]);
    }
  });

  it("releases a failed bundle and continues later passes", async () => {
    const runner = new MaintenanceRunner(new AbortController().signal, 1);
    runner.schedule(() => { throw new Error("Worker failure"); }, true);
    runner.schedule(async () => "continued", true);
    expect(await runner.run(0)).toEqual([
      { status: "rejected", reason: expect.any(Error) },
      { status: "fulfilled", value: "continued" },
    ]);
  });

  it("settles interrupted passes promptly and never starts the queued domain", async () => {
    const controller = new AbortController();
    const runner = new MaintenanceRunner(controller.signal, 1);
    let finish: (value: string) => void = () => {};
    runner.schedule(() => new Promise<string>((resolve) => { finish = resolve; }));
    const next = vi.fn(async () => "queued");
    runner.schedule(next);
    const pending = runner.run(0);
    await tick();
    controller.abort();
    expect((await pending).every((result) => result.status === "rejected")).toBe(true);
    finish("late completion");
    await tick();
    expect(next).not.toHaveBeenCalled();

    const cancelled = new MaintenanceRunner(controller.signal);
    cancelled.schedule(next);
    expect((await cancelled.run())[0].status).toBe("rejected");
    expect(next).not.toHaveBeenCalled();
  });
});
