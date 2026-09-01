import { describe, expect, it } from "vitest";

import { relayCallbackPage } from "./callback-page";

describe("relayCallbackPage", () => {
  it("escapes provider-controlled text and return URLs", async () => {
    const response = relayCallbackPage({
      title: "Connected <now>",
      detail: 'Account </p><script>alert("x")</script>',
      status: 200,
      returnUrl: new URL("https://instance.example.test/callback?value=%22%3E%3Csvg%3E"),
    });
    const html = await response.text();

    expect(html).toContain("Connected &lt;now&gt;");
    expect(html).toContain("Account &lt;/p&gt;&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("https://instance.example.test/callback?value=%22%3E%3Csvg%3E");
  });
});
