import { describe, expect, it } from "vitest";

import type { ControlPlaneClient } from "./control-plane-client";
import type { VmJob } from "./protocol";
import { startToolBridge } from "./tool-bridge";

const TOKEN = "concurrency-test-token";

function reviewJob(): VmJob {
  return {
    anchor: "pr",
    model: "deepseek/deepseek-v4-flash",
    interactive: true,
    chain: false,
    writesToRepo: false,
    authUrl: "https://x-access-token:test@github.com/org/repo.git",
    subagents: {
      models: false,
      favorites: [],
      maxParallel: 2,
      allowedIds: [],
      abovePlanIds: [],
      maxMultiplier: null,
    },
    webSearch: true,
    webSearchMax: 5,
    imageInput: false,
    prInlineComments: 0,
  } as unknown as VmJob;
}

async function comment(bridgeUrl: string, index: number): Promise<unknown> {
  const response = await fetch(`${bridgeUrl}/tool/comment_pr_line`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      args: { body: `Comment ${index}` },
      callID: `call-${index}`,
      sessionID: "session-1",
    }),
  });
  expect(response.status).toBe(200);
  return response.json();
}

describe("tool bridge quota concurrency", () => {
  it("serializes simultaneous inline comments so the run-wide limit is exact", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let accepted = 0;

    const cp = {
      callTool: async (_name: string, body: Record<string, unknown>) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => setTimeout(resolve, 2));

        const used = body.prInlineComments as number;
        const success = used < 5;
        if (success) accepted += 1;
        inFlight -= 1;
        return {
          result: success ? { ok: true } : { error: "Inline comment limit reached." },
          success,
          inlineUsed: success ? used + 1 : used,
        };
      },
    } as ControlPlaneClient;

    const bridge = await startToolBridge({
      job: reviewJob(),
      cp,
      authorizationToken: TOKEN,
      port: 0,
    });
    try {
      await Promise.all(Array.from({ length: 8 }, (_, index) => comment(bridge.url, index)));
      expect(maxInFlight).toBe(1);
      expect(accepted).toBe(5);
      expect(bridge.prInlineComments).toBe(5);
    } finally {
      await bridge.close();
    }
  });
});
