import { describe, expect, it } from "vitest";

import { relayCallbackPage } from "./callback-page";

describe("relayCallbackPage", () => {
  it("renders only the selected static document", async () => {
    const response = relayCallbackPage("github-failed", 400);
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain("GitHub authorization failed");
    expect(html).toContain("restart the authorization");
  });
});
