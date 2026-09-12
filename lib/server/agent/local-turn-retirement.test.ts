import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/desktop/local-turn/route";

describe("retired desktop local-turn endpoint", () => {
  it("rejects every old claim with a non-destructive transition", async () => {
    const response = await POST();

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "localExecutionRetired",
      code: "localExecutionRetired",
      transition: {
        action: "start_server_conversation",
        localFilesPreserved: true,
        checkpointPortable: false,
      },
    });
  });
});
