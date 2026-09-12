import { describe, expect, it } from "vitest";

import {
  retainedLocalRunLayout,
  retainedLocalRunRoot,
} from "./local-run-history";
import { vmLocalDiffPath } from "@/lib/server/agent/harness-layout";

describe("retained desktop run history", () => {
  it("reconstructs the original run-scoped artifact path", () => {
    const userDataPath = "/Users/test/Library/Application Support/minddy/";
    const runId = "8e40da49-768f-45ea-9248-e2a769727b75";
    const root = retainedLocalRunRoot(userDataPath, runId);
    const layout = retainedLocalRunLayout(userDataPath, runId);

    expect(root).toBe(`${userDataPath}agent-runs/${runId}`);
    expect(layout.root).toBe(root);
    expect(vmLocalDiffPath(layout)).toContain(`${root}/`);
  });
});
