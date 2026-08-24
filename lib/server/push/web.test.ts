import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  generateRequestDetails: vi.fn(),
  lookup: vi.fn(),
  pinnedRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: H.lookup }));
vi.mock("@/lib/server/pinned-request", () => ({ pinnedRequest: H.pinnedRequest }));
vi.mock("web-push", () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
      public readonly headers: Record<string, string>,
      public readonly body: string,
      public readonly endpoint: string,
    ) {
      super(message);
      this.name = "WebPushError";
    }
  }
  return {
    default: { generateRequestDetails: H.generateRequestDetails },
    WebPushError,
  };
});

const { sendPinnedWebPushNotification } = await import("./web");

const SUBSCRIPTION = {
  endpoint: "https://push.example/subscription/1",
  keys: { p256dh: "public-key", auth: "auth-secret" },
};
const ENCRYPTED_BODY = Buffer.from("encrypted-payload");

function response(status: number, headers: HeadersInit = {}, body = "") {
  return {
    status,
    headers: new Headers(headers),
    stream: Readable.from([Buffer.from(body)]),
    destroy: vi.fn(),
  };
}

beforeEach(() => {
  H.generateRequestDetails.mockReset();
  H.generateRequestDetails.mockReturnValue({
    endpoint: SUBSCRIPTION.endpoint,
    method: "POST",
    headers: {
      Authorization: "vapid token",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(ENCRYPTED_BODY.byteLength),
      TTL: "86400",
    },
    body: ENCRYPTED_BODY,
  });
  H.lookup.mockReset();
  H.lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
  H.pinnedRequest.mockReset();
});

describe("sendPinnedWebPushNotification", () => {
  it("connects only to the public address validated for the endpoint", async () => {
    H.pinnedRequest.mockResolvedValue(response(201, { "x-request-id": "push-1" }, "ok"));

    await expect(
      sendPinnedWebPushNotification(SUBSCRIPTION, "payload", {
        TTL: 86_400,
        urgency: "normal",
      }),
    ).resolves.toEqual({
      statusCode: 201,
      body: "ok",
      headers: { "x-request-id": "push-1" },
    });

    expect(H.generateRequestDetails).toHaveBeenCalledWith(
      SUBSCRIPTION,
      "payload",
      { TTL: 86_400, urgency: "normal" },
    );
    expect(H.pinnedRequest).toHaveBeenCalledTimes(1);
    expect(H.pinnedRequest.mock.calls[0]?.[1]).toMatchObject({
      address: "93.184.216.34",
      method: "POST",
      body: ENCRYPTED_BODY,
      headers: expect.objectContaining({ Authorization: "vapid token" }),
    });
  });

  it("rejects an endpoint whose delivery-time DNS answer includes a private address", async () => {
    H.lookup.mockResolvedValue([
      { address: "93.184.216.34" },
      { address: "10.0.0.8" },
    ]);

    await expect(
      sendPinnedWebPushNotification(SUBSCRIPTION, "payload", {}),
    ).rejects.toMatchObject({ name: "SafeFetchError", reason: "url" });
    expect(H.pinnedRequest).not.toHaveBeenCalled();
  });

  it("does not follow a push-service redirect", async () => {
    H.pinnedRequest.mockResolvedValue(
      response(307, { location: "http://169.254.169.254/latest/meta-data" }),
    );

    await expect(
      sendPinnedWebPushNotification(SUBSCRIPTION, "payload", {}),
    ).rejects.toMatchObject({ name: "SafeFetchError", reason: "unreachable" });
    expect(H.pinnedRequest).toHaveBeenCalledTimes(1);
  });

  it("preserves web-push status errors for subscription maintenance", async () => {
    H.pinnedRequest.mockResolvedValue(
      response(410, { "content-type": "text/plain" }, "subscription expired"),
    );

    await expect(
      sendPinnedWebPushNotification(SUBSCRIPTION, "payload", {}),
    ).rejects.toMatchObject({
      name: "WebPushError",
      statusCode: 410,
      endpoint: SUBSCRIPTION.endpoint,
      body: "subscription expired",
    });
  });

  it("rejects a non-HTTPS endpoint before resolving or connecting", async () => {
    H.generateRequestDetails.mockReturnValue({
      endpoint: "http://push.example/subscription/1",
      method: "POST",
      headers: {},
      body: ENCRYPTED_BODY,
    });

    await expect(
      sendPinnedWebPushNotification(SUBSCRIPTION, "payload", {}),
    ).rejects.toMatchObject({ name: "SafeFetchError", reason: "url" });
    expect(H.lookup).not.toHaveBeenCalled();
    expect(H.pinnedRequest).not.toHaveBeenCalled();
  });
});
