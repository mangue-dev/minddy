import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PushPayload } from "./payload";
import {
  isWnsConfigured,
  resetWnsTokenCache,
  sendWnsNotification,
  wnsToastXml,
} from "./wns";

const PAYLOAD: PushPayload = {
  title: "MIN-476 <ready>",
  body: "Alice & Bob said \"hello\"",
  url: "/projects/p?issue=i&tab=comments",
  tag: "issue-i",
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetWnsTokenCache();
  vi.stubEnv("WNS_TENANT_ID", "tenant-id");
  vi.stubEnv("WNS_APP_ID", "app-id");
  vi.stubEnv("WNS_CLIENT_SECRET", "client-secret");
});

describe("WNS transport", () => {
  it("stays disabled until every Entra credential is present", () => {
    expect(isWnsConfigured()).toBe(true);
    vi.stubEnv("WNS_CLIENT_SECRET", "");
    expect(isWnsConfigured()).toBe(false);
  });

  it("escapes adaptive toast text and protocol activation arguments", () => {
    const xml = wnsToastXml(PAYLOAD);
    expect(xml).toContain('activationType="protocol"');
    expect(xml).toContain("minddy://open?next=%2Fprojects%2Fp%3Fissue%3Di%26tab%3Dcomments");
    expect(xml).toContain("MIN-476 &lt;ready&gt;");
    expect(xml).toContain("Alice &amp; Bob said &quot;hello&quot;");
  });

  it("reuses OAuth tokens and sends the required toast headers", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-one", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const endpoint = "https://db5p.notify.windows.com/?token=channel";
    expect(await sendWnsNotification(endpoint, PAYLOAD, 60)).toMatchObject({ status: 200 });
    expect(await sendWnsNotification(endpoint, PAYLOAD, 60)).toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe(endpoint);
    expect(request[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer token-one",
        "X-WNS-Type": "wns/toast",
        "X-WNS-TTL": "60",
      }),
    });
  });

  it("refreshes OAuth once after a WNS authentication failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "stale", expires_in: 3600 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await sendWnsNotification("https://db5p.notify.windows.com/?token=channel", PAYLOAD),
    ).toEqual({ status: 200, reason: null });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer fresh" }),
    });
  });
});
