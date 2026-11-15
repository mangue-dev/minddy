import { describe, expect, it } from "vitest";

import { PrOperationInProgressError, withPrOperation } from "./pr-operation-lock";

const PR = { provider: "github" as const, repoFullName: "Acme/App", number: 7 };

function held() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return { gate, release };
}

describe("withPrOperation", () => {
  it("refuses the same operation on the same PR while one runs, whatever the repository casing", async () => {
    const { gate, release } = held();
    const first = withPrOperation(PR, "merge-flow", () => gate);
    await expect(withPrOperation({ ...PR, repoFullName: "acme/app" }, "merge-flow", async () => "second"))
      .rejects.toBeInstanceOf(PrOperationInProgressError);
    release();
    await first;
    await expect(withPrOperation(PR, "merge-flow", async () => "after")).resolves.toBe("after");
  });

  it("lets other operations and other PRs run", async () => {
    const { gate, release } = held();
    const first = withPrOperation(PR, "merge", () => gate);
    await expect(withPrOperation(PR, "update-title", async () => "title")).resolves.toBe("title");
    await expect(withPrOperation({ ...PR, number: 8 }, "merge", async () => "other")).resolves.toBe("other");
    release();
    await first;
  });

  it("releases the lock when the operation throws", async () => {
    await expect(withPrOperation(PR, "merge", async () => { throw new Error("forge said no"); }))
      .rejects.toThrow("forge said no");
    await expect(withPrOperation(PR, "merge", async () => "retry")).resolves.toBe("retry");
  });
});
